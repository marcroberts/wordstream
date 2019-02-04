document.addEventListener("DOMContentLoaded", function(event) {

  var socket = io.connect('wss://twitter-word-stream.herokuapp.com/'),
      text_nodes = {},
      frame = 0,

      show_max = 50,

      bucket_count = 30, // how many buckets to remember
      bucket_width = 10, // how many seconds worth of words to keep in the buckets
      current_bucket = {},
      buckets = [current_bucket];


  function rotate_buckets() {

    current_bucket = {};
    buckets.push(current_bucket);

    while (buckets.length >= bucket_count) buckets.shift();

  }

  function render() {
    var max = 0,
        words = {},
        displayed_words = [];

    // increment frame counter
    frame++;

    // get counts of words across all buckets
    _.each(buckets, function(bucket){
      _.each(bucket, function(count, word) {
        words[word] = (words[word] || 0) + count;
        if (words[word] > max) max = words[word];
      });
    });

    // filter them to just the most popular ones
    displayed_words = _.sortBy(_.keys(words), function(word) {
      return max - words[word];
    }).slice(0,show_max);

    _.each(displayed_words, function(word) {
      var size = words[word] / max,
          text, node;

      if (!text_nodes[word]) {
        text = document.createTextNode(word);
        node = document.createElement('span');
        var top = 80*Math.random();
        var left = 70*Math.random();
        node.setAttribute('style', "top: " + top + "%; left: " + left + '%; color: hsla('+360*Math.random()+',50%,50%,0.75)');
        node.appendChild(text);
        document.body.appendChild(node);
        text_nodes[word] = {
          updated: frame,
          node: node
        };
      } else {
        text_nodes[word].updated = frame;
      }

      text_nodes[word].node.style.transform = 'scale(' + (0.2 + size*0.8) + ')';
      text_nodes[word].node.style.webkitTransform = 'scale(' + (0.2 + size*0.8) + ')';

    });

    // clear expired words
    _.each(text_nodes, function(obj, word) {
      if (obj.updated < frame) {
        obj.node.remove();
        delete text_nodes[word];
      }
    });


  }

  setInterval(rotate_buckets, bucket_width*1000);
  setInterval(render, 500);

  socket.on('tweet', function (data) {
    _.each(data, function(word) {
      current_bucket[word] = (current_bucket[word] || 0) + 1;
    });
  });

});
