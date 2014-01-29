// make these alphabetical
var glob = require('glob');
var path = require('path');
var async = require('async');
var spawn = require('child_process').spawn;

var config = require('./config');
var logger = require('./logger');
var log = logger.cat('permission');

exports.setStartingPermission = function(spec, callback) {
  log.info({ spec: spec }, 'setStartingPermission');
  var find = spawn('find', [ 
    'starting', '-type', 'd',
    '-exec', 'fs', 'sa', '{}', 'system:anyuser', 'read', ';'
  ], { 
    cwd: path.join(config.student.repos, config.student.semester, spec.kind, spec.proj), 
    stdio: 'pipe' 
  });
  find.on('exit', function(code) {
    if (code != 0) {
      return callback({ dmesg: 'Error setting starting afs permissions' });
    }
    callback();
  });
};

exports.setStudentPermission = function(spec, callback) {
  log.info({ spec: spec }, 'setStudentPermission');
  var findArgs = [ spec.users.join('-') + '.git', '-type', 'd', '-exec',
   'fs', 'sa', '{}', 'system:anyuser', 'none' ]
  // add args so that each student user gets write permissions
  for (var i = 0; i < spec.users.length; i ++) {
    findArgs.push(spec.users[i], 'write');
  }
  findArgs.push(';');
  var find = spawn('find', findArgs, { 
    cwd: path.join(config.student.repos, config.student.semester, spec.kind, spec.proj), 
    stdio: 'pipe' 
  });
  find.on('exit', function(code) {
    if (code != 0) {
      return callback({ dmesg: 'Error setting student afs permissions' });
    }
    callback();
  });
};
