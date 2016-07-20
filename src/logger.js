const bunyan = require('bunyan');
const path = require('path');
const spawn = require('child_process').spawn;

const config = require('./config');

const main = require.main ? require.main.filename : '_console';

const filename = 'log/didit-' + path.basename(main, '.js') + '.log';

let streams = [
  { path: filename }
];
if (config.log.console) {
  let bin = path.join(__dirname, '..', 'node_modules/bunyan/bin/bunyan');
  let pretty = spawn(bin, [ '--output', 'short' ], {
    stdio: [ 'pipe', process.stdout, process.stderr ]
  });
  pretty.unref(); // don't wait for pretty-printer to terminate
  pretty.stdin.on('error', function(err) { // don't allow pretty-printer errors to propagate
    console.error('Error writing to console log', err);
  });
  streams.push({ stream: pretty.stdin });
}
if (config.log.mail) {
  let mailer = require('./mailer');
  streams.push({
    level: 'warn',
    type: 'raw',
    stream: {
      write(obj) {
        if (obj.in == 'mailer') { return; }
        mailer.sendMail({ to: config.log.mail }, 'Error report', 'error', { err: obj }, function() {});
      },
      end() {}
    }
  });
}

let logger = bunyan.createLogger({
  name: 'didit',
  streams,
  serializers: Object.assign({
    spec(spec) {
      let users = spec.users && spec.users.join('-');
      return spec.kind+'/'+spec.proj+'/'+users+'/'+spec.rev;
    }
  }, bunyan.stdSerializers)
});

// obtain a category logger
exports.cat = function(category) {
  return logger.child({ in: category });
};

// obtain an Express request/response logger
exports.express = function() {
  let child = exports.cat('express');
  return function(req, res, next) {
    let end = res.end;
    res.end = function() {
      res.end = end;
      res.end.apply(this, arguments);
      child.info({ req, res });
    };
    next();
  }
};
