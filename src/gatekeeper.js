const async = require('async');
const fs = require('fs');
const fsextra = require('fs-extra');
const glob = require('glob');
const path = require('path');

const config = require('./config');
const log = require('./logger').cat('gatekeeper');

function ticketPath(spec) {
  return path.join(config.build.results, 'tickets', config.student.semester, spec.kind, spec.proj);
}

function releasePath(spec) {
  return path.join(config.student.repos, config.student.semester, spec.kind, spec.proj, 'didit', 'released');
}

// find all tickets matching a kind, proj, and/or users
// callback returns a list of repo specs
exports.findTickets = function(spec, callback) {
  log.info({ spec }, 'findTickets');
  let kind = spec.kind || config.glob.kind;
  let proj = spec.proj || '*';
  let users = spec.users ? '?(*-)' + spec.users.join('-') + '?(-*)' : '*';
  glob(path.join('tickets', config.student.semester, kind, proj, users), {
    cwd: config.build.results
  }, function(err, files) {
    if (err) {
      err.dmesg = err.dmesg || 'error finding tickets';
      callback(err);
      return;
    }
    callback(err, files.map(function(file) {
      let parts = file.split(path.sep);
      return { kind: parts[2], proj: parts[3], users: parts[4].split('-') };
    }));
  });
};

// create tickets for the given project
exports.createTickets = function(spec, usernames, callback) {
  log.info({ spec }, 'createTickets');
  async.each(usernames, function(users, next) {
    if (users.some(function(user) { return ! user.match(/^\w+$/); })) {
      return next({ dmesg: 'Invalid username' })
    }
    fsextra.mkdirs(path.join(ticketPath(spec), users.join('-')), next);
  }, callback);
};

// callback returns a boolean
exports.isProjectReleased = function(spec, callback) {
  log.info({ spec }, 'isProjectReleased');
  fs.exists(releasePath(spec), async.apply(callback, null));
};

// find all released projects matching a kind and/or proj
// callback returns a list of project specs
exports.findReleasedProjects = function(spec, callback) {
  log.info({ spec }, 'findReleasedProjects');
  let kind = spec.kind || config.glob.kind;
  let proj = spec.proj || '*';
  glob(path.join(config.student.semester, kind, proj, 'didit', 'released'), {
    cwd: config.student.repos
  }, function(err, dirs) {
    if (err) {
      err.dmesg = err.dmesg || 'error finding released projects'
      return callback(err);
    }
    callback(err, dirs.map(function(dir) {
      let parts = dir.split(path.sep);
      return { kind: parts[1], proj: parts[2] };
    }));
  });
};

exports.releaseProject = function(spec, callback) {
  log.info({ spec }, 'releaseProject');
  fsextra.mkdirs(releasePath(spec), callback);
};
