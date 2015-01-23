var request = require('request')
  , split = require('split')
  , Writable = require('stream').Writable
  , util = require('util')

function backoff (current, max, step, _value) {
  return function () {
    if ((_value = current) > max) {
      throw new Error('Exceeded twitter rate limit')
    }
    current = step(current)
    return _value
  }

}

var Twitter = function (oauth) {
  if(!(this instanceof Twitter)) {
    return new Twitter(oauth)
  }

  if (!oauth || !(oauth.consumer_secret || oauth.consumer_key || oauth.token || oauth.token_secret)) {
    throw new Error('Oauth credentials required')
  }
  this.oauth = oauth

  this.backoffs()

  Writable.call(this, {objectMode: true})
}

util.inherits(Twitter, Writable)

// Here so we can easily test this
Twitter.prototype.twitterUrl = 'https://stream.twitter.com/1.1/statuses/sample.json'

Twitter.prototype.timeoutInterval = 1000 * 90 // default twitter timeout is 90 seconds

// Backup strategies based off twitter's guidelines
//    See https://dev.twitter.com/docs/streaming-apis/connecting#Reconnecting
Twitter.prototype.backoffs = function () {
  // Network hiccup, try every 250 seconds
  this.networkBackoff = backoff(0, 16 * 1000, function (x) { return x + 250 })
  // Rate limited. Try exponetially starting at 5 seconds
  this.httpBackoff = backoff(5 * 1000, 320 * 1000, function (x) { return x * 2 })
  // Rate limited. Try exponetially starting at a minute
  this.rateBackoff = backoff(60 * 1000, Infinity, function (x) { return x * 2 })
}

Twitter.prototype.reconnect = function () {
  if (this.stale) {
    if (this.stream) {
      this.abort()
    }
    this.connect()
  }
}

Twitter.prototype._write = function (data, encoding, done) {
  if (data.text) {
    this.emit('tweet', data)
  } else if (data.delete) {
    this.emit('delete', data.delete)
  } else if (data.scrub_geo) {
    this.emit('scrub_geo', data.scrub_geo)
  } else if (data.limit) {
    this.emit('limit', data.limit)
  } else if (data.status_withheld) {
    this.emit('status_withheld', data.status_withheld)
  } else if (data.user_withheld) {
    this.emit('user_withheld', data.user_withheld)
  } else if (data.disconnect) {
    this.emit('disconnect', data.disconnect)
  } else if (data.warning) {
    this.emit('warning', data.warning)
  }
  done()
}

Twitter.prototype.connect = function () {
  this.stale = false

  this.stream = request.get({
    url: this.twitterUrl,
    oauth: this.oauth
  })

  this.stream.on('response', (function (res) {
    var self = this
    // Rate limited...
    if (res.statusCode === 420) {
      this.abort()
      setTimeout(function () {
        self.connect()
      }, this.rateBackoff())

      this.emit('reconnect', {type: 'rate-limit'})
      return
    }

    // Http error
    if (res.statusCode > 200) {
      this.abort()
      setTimeout(function () {
        self.connect()
      }, this.httpBackoff())

      this.emit('reconnect', {type: 'http', err: new Error('Twitter connection error' + res.statusCode)})
      return
    }

    // 200. Alive and well.
    this.backoffs()

    this.parser = split(null, function (d) {
      try {
        return JSON.parse(d)
      } catch (e) {}
    })

    this.parser = res.pipe(this.parser, {end: false})
    this.parser.pipe(this)

    // Handle this: https://dev.twitter.com/docs/streaming-apis/connecting#Stalls
    // Abort the connection and reconnect if we haven't received an update for 90 seconds
    var close = (function () {
        this.abort()
        process.nextTick(this.connect.bind(this))
        this.emit('reconnect', {type: 'stall'})
      }).bind(this)

    this.timeout = setTimeout(close, this.timeoutInterval)

    res.on('data', function () {
      clearTimeout(self.timeout)
      self.timeout = setTimeout(close, self.timeoutInterval)
    })
  }).bind(this))

  this.stream.on('error', (function (err) {
    var self = this
    this.abort()
    this.emit('reconnect', {type: 'network', err: err})
    setTimeout(function () {
      self.connect()
    }, this.networkBackoff())
  }).bind(this))
}

Twitter.prototype.abort = function () {
  if (this.parser) {
    this.parser.destroy()
  }
  clearTimeout(this.timeout)
  this.stream.abort()
  this.stream = null
}

module.exports = Twitter