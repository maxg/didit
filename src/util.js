const byline = require('byline');
const spawn = require('child_process').spawn;

const log = require('./logger').cat('util');

// find the value and index of the first element in an array satisfying a predicate
exports.arrayFind = function arrayFind(array, predicate) {
  for (let i = 0; i < array.length; i++) {
    let value = array[i];
    if (predicate(value, i, array)) { return { value, index: i }; }
  }
  return { index: -1 };
};

// return an object equality predicate that examines only the given keys
exports.equalityModulo = function equalityModulo(/* keys */) {
  let keys = Array.prototype.slice.call(arguments);
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
  let child = spawn(command, args, options);
  child.on('error', function(err) {
    log.error({ err, command, args, options });
  });
  byline(child.stderr, { encoding: 'utf8' }).on('data', function(line) {
    log.error({ err: line, command, args, options });
  });
  return child;
};

exports.onExit = function(child, callback) {
  return child.on('exit', function(code) {
    callback(code === 0 ? null : { code });
  });
};
