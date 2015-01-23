var app = require('express')(),
    dotenv = require('dotenv'),
    server = require('http').Server(app),
    io = require('socket.io')(server),
    xt = require('keyword-extractor'),
    franc = require('franc'),
    twitter = require('./twitter-stream'),
    stream,
    clients = 0;

dotenv.load();

stream = new twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  token: process.env.TWITTER_TOKEN,
  token_secret: process.env.TWITTER_TOKEN_SECRET
});

io.set('origins', '*:*');

server.listen(process.env.PORT || 5000);

app.get('/', function(request, response) {
  response.status(403).send('VERBOTEN');
});

io.on('connect', function(socket) {
  clients++;
  console.log('CLIENT CONNECTED - COUNT=' + clients);

  socket.on('disconnect', function() {
    clients--;
    console.log('CLIENT DISCONNECTED - COUNT=' + clients);
  });
});


function exceptions(word){
  if (word.match(/https?:/)) return false;
  if (word.match(/^@/)) return false;
  if (word.match(/&|\/|"/)) return false;

  return true;
}


stream.on('tweet', function(tweet) {
  // ignore retwets
  if (tweet.retweeted_status || tweet.text.match(/^RT/)) return;

  // only english for now
  if (franc(tweet.text) != 'eng') return;

  // parse that tweet, extract words
  words = xt.extract(tweet.text,{
    language:"english",
    remove_digits: true,
    return_changed_case:true
  }).filter(exceptions);

  if (words.length > 0) io.emit('tweet', words);
});

stream.connect();
