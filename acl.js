var config = require('./config');
var util = require('./util');
var log = require('./logger').cat('acl');

exports.user = Object.freeze({
  other: { user: 'other' }
});

exports.level = Object.freeze({
  none: { level: 'none' },
  read: { level: 'read' },
  write: { level: 'write' }
});

exports.set = function(dir, user, perm, callback) {
  if (backends[config.student.acl]) {
    log.info({ dir: dir, acl: config.student.acl, user: user, perm: perm }, 'ACL');
    return backends[config.student.acl](dir, user, perm, callback);
  }
  log.warn({ dir: dir, acl: config.student.acl }, 'unable to set ACL');
  callback();
};

var backends = {
  none: function(dir, user, perm, callback) {
    callback();
  },
  
  afs: function(dir, user, perm, callback) {
    switch (user) {
      case exports.user.other: user = 'system:anyuser'; break;
      // otherwise, user is a username
    }
    switch (perm) {
      case exports.level.none: perm = 'none'; break;
      case exports.level.read: perm = 'read'; break;
      case exports.level.write: perm = 'write'; break;
      default: return callback({ dmesg: 'unknown permission value' });
    }
    util.onExit(util.spawnAndLog('find', [
      '.', '-type', 'd', '-exec', 'fs', 'setacl', '-acl', user, perm, '-dir', '{}', '+'
    ], {
      cwd: dir,
      stdio: 'pipe'
    }), callback);
  },
  
  test: function(dir, user, perm, callback) {
    exports.set.calls = exports.set.calls || [];
    exports.set.calls.push({
      dir: dir,
      user: user,
      perm: perm
    });
    callback();
  }
};
