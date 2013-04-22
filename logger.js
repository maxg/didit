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
  pretty.stdin.on('error', function(err) { // don't allow pretty-printer errors to propagate
    console.error('Error writing to console log', err);
  });
  streams.push({ stream: pretty.stdin });
}
if (config.log.mail) {
  var mailer = require('./mailer');
  streams.push({
    level: 'warn',
    type: 'raw',
    stream: {
      write: function(obj) {
        if (obj.in == 'mailer') { return; }
        mailer.sendMail({ to: config.log.mail }, 'Error report', 'error', { err: obj }, function() {});
      },
      end: function() {}
    }
  });
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
