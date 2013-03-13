var bunyan = require('bunyan');
var path = require('path');
var spawn = require('child_process').spawn;

var config = require('./config');

var filename = 'log/didit-' + path.basename(require.main.filename, '.js') + '.log';

var streams = [
  { path: filename }
];
if (config.log.console) {
  var bin = path.join(require.main.filename, '..', 'node_modules/bunyan/bin/bunyan');
  var pretty = spawn(bin, [ '--output', 'short' ], {
    stdio: [ 'pipe', process.stdout, process.stderr ]
  });
  pretty.unref(); // don't wait for pretty-printer to terminate
  streams.push({ stream: pretty.stdin });
}

var logger = bunyan.createLogger({
  name: 'didit',
  streams: streams,
  serializers: {
    req: bunyan.stdSerializers.req,
    res: bunyan.stdSerializers.res,
    spec: function(spec) {
      var users = spec.users && spec.users.join('-');
      return spec.kind+'/'+spec.proj+'/'+users+'/'+spec.rev;
    }
  }
});

// obtain a category logger
exports.cat = function(category) {
  return logger.child({ in: category });
};

// obtain an Express request/response logger
exports.express = function() {
  var child = exports.cat('express');
  return function(req, res, next) {
    var end = res.end;
    res.end = function() {
      res.end = end;
      res.end.apply(this, arguments);
      child.info({ req: req, res: res });
    };
    next();
  }
};
