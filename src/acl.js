const config = require('./config');
const util = require('./util');
const log = require('./logger').cat('acl');

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
    log.info({ dir, acl: config.student.acl, user, perm }, 'ACL');
    return backends[config.student.acl](dir, user, perm, callback);
  }
  log.warn({ dir, acl: config.student.acl }, 'unable to set ACL');
  callback();
};

const backends = {
  none(dir, user, perm, callback) {
    callback();
  },
  
  afs(dir, user, perm, callback) {
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
  
  test(dir, user, perm, callback) {
    exports.set.calls = exports.set.calls || [];
    exports.set.calls.push({ dir, user, perm });
    callback();
  }
};
