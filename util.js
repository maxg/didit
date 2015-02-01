var byline = require('byline');
var spawn = require('child_process').spawn;

var log = require('./logger').cat('util');

// return an object equality predicate that examines only the given keys
exports.equalityModulo = function equalityModulo(/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  return function(a, b) {
    return keys.every(function(key) { return a[key] == b[key]; });
  }
};

// subtract one array of objects from another using the given object equality predicate
exports.difference = function difference(equality, superset, subset) {
  return superset.filter(function(a) {
    return ! subset.some(function(b) {
      return equality(a, b);
    });
  });
};

// spawn a process and log stderr
// options must include a 'pipe' setting for stderr
exports.spawnAndLog = function(command, args, options) {
  var child = spawn(command, args, options);
  child.on('error', function(err) {
    log.error({ err: err, command: command, args: args, options: options });
  });
  byline(child.stderr, { encoding: 'utf8' }).on('data', function(line) {
    log.error({ err: line, command: command, args: args, options: options });
  });
  return child;
};

exports.onExit = function(child, callback) {
  return child.on('exit', function(code) {
    callback(code === 0 ? null : { code: code });
  });
};
