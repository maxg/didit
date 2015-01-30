var async = require('async');
var byline = require('byline');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var moment = require('moment');
var ncp = require('ncp');
var path = require('path');
var rimraf = require('rimraf');
var spawn = require('child_process').spawn;
var temp = require('temp');

var config = require('./config');
var util = require('./util');
var log = require('./logger').cat('git');

function studentSourcePath(spec) {
  return [ config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-') ].join('/') + '.git';
}

function startingSourcePath(spec) {
  return [ config.student.repos, config.student.semester, spec.kind, spec.proj, 'didit', 'starting' ].join('/') + '.git';
}

function builderDir(spec) {
  return [ config.staff.semester, spec.kind, spec.proj, 'grading' ].join('/');
}

function startingDir(spec) {
  return [ config.staff.semester, spec.kind, spec.proj, 'starting' ].join('/');
}

function findRev(dir, gitargs, callback) {
  if ( ! fs.existsSync(dir)) {
    callback({ dmesg: 'no repository' });
    return;
  }
  var out = byline(util.spawnAndLog('git', gitargs, {
    cwd: dir,
    stdio: 'pipe'
  }).stdout, { encoding: 'utf8' });
  var rev = null;
  out.on('data', function(line) { rev = line; });
  out.on('end', function() {
    if (rev) {
      callback(null, rev.substring(0, 7));
    } else {
      callback({ dmesg: 'no revision' });
    }
  });
}

// find all the student repos matching a kind, project and/or users
exports.findStudentRepos = function(spec, callback) {
  var kind = spec.kind || '*';
  var proj = spec.proj || '*';
  var users = spec.users ? '?(*-)' + spec.users.join('-') + '?(-*)' : '*';
  log.info('findStudentRepos', kind, proj, users);
  glob(path.join(config.student.semester, kind, proj, users + '.git'), {
    cwd: config.student.repos
  }, function(err, dirs) {
    if (err) {
      err.dmesg = err.dmesg || 'error finding student repos'
      callback(err);
      return;
    }
    callback(err, dirs.map(function(dir) {
      var parts = dir.split(path.sep);
      return { kind: parts[1], proj: parts[2], users: parts[3].split('.')[0].split('-') };
    }));
  });
};

exports.studentSourceRev = function(spec, callback) {
  findRev(studentSourcePath(spec), [ 'rev-parse', '--verify', 'refs/heads/master' ], callback);
};

exports.studentSourceRevAt = function(spec, when, callback) {
  findRev(studentSourcePath(spec),
          [ 'rev-list', '--max-count=1', '--before=' + when.format(moment.gitFormat), 'refs/heads/master' ],
          callback);
};

// obtain commit log for student source
// callback returns an array of commit info objects
exports.studentSourceLog = function(spec, range, callback) {
  log.info({ spec: spec, range: range}, 'studentSourceLog');
  var names = [ 'rev', 'author', 'authoremail', 'authortime', 'committer', 'committeremail', 'committertime', 'subject' ];
  var format = [ '%h', '%an', '%ae', '%at', '%cn', '%ce', '%ct', '%s' ].join('%x00');
  var lines = [];
  var out = byline(util.spawnAndLog('git', [ 'log',
    '--pretty=format:' + format
  ].concat(range).concat([ '--' ]), {
    cwd: studentSourcePath(spec),
    stdio: 'pipe'
  }).stdout, { encoding: 'utf8' });
  out.on('data', function(line) {
    var res = {};
    line.split('\0').forEach(function(val, idx) { res[names[idx]] = val; });
    lines.push(res);
  });
  out.on('end', function() {
    callback(null, lines);
  });
};

// clone student source
// callback returns student commit metadata
exports.cloneStudentSource = function(spec, dest, callback) {
  log.info({ spec: spec, dest: dest }, 'cloneStudentSource');
  async.auto({
    
    depth: function(next) {
      var out = byline(util.spawnAndLog('git', [ 'rev-list',
        spec.rev + '..master', '--'
      ], {
        cwd: studentSourcePath(spec),
        stdio: 'pipe'
      }).stdout, { encoding: 'utf8' });
      var count = 0;
      out.on('data', function() { count++; });
      out.on('end', function() { next(null, count); });
    },
    
    // clone the student's repository
    clone: [ 'depth', function(next, results) {
      log.info('cloneStudentSource', 'clone');
      util.spawnAndLog('git', [ 'clone',
        '--quiet', '--no-checkout', '--depth', results.depth + 2, '--branch', 'master',
        'file://' + studentSourcePath(spec),
        '.'
      ], {
        cwd: dest,
        stdio: 'pipe'
      }).on('exit', function(code) {
        next(code == 0 ? null : { dmesg: 'error cloning source' });
      });
    } ],
    
    // check out the specified revision
    checkout: [ 'clone', function(next) {
      log.info('cloneStudentSource', 'checkout');
      util.spawnAndLog('git', [ 'checkout',
        '--quiet', spec.rev
      ], {
        cwd: dest,
        stdio: 'pipe'
      }).on('exit', function(code) {
        next(code == 0 ? null : { dmesg: 'error checking out source revision' });
      });
    } ],
    
    // obtain student revision metadata
    log: [ 'checkout', function(next) {
      log.info('cloneStudentSource', 'log');
      exports.studentSourceLog(spec, [ '-1', spec.rev ], function(err, lines) {
        next(err, lines[0]);
      });
    } ]
  }, function(err, results) {
    callback(err, results ? results.log : null);
  });
};

exports.builderRev = function(spec, callback) {
  exports.builderRevBefore(spec, 'master', callback);
};

exports.builderRevBefore = function(spec, upto, callback) {
  staffDirRevBefore(builderDir(spec), upto, callback);
};

function staffDirRevBefore(dir, upto, callback) {
  findRev(config.staff.repo,
          [ 'rev-list', '--max-count=1', upto, '--', dir ],
          callback);
}

// fetch staff repository materials
// callback returns staff commit hash
function fetchStaffDir(dir, dest, callback) {
  log.info({ dir: dir, dest: dest }, 'fetchStaffDir');
  var procs = [ 'id', 'tar' ];
  async.auto({
    
    // obtain the staff repository revision
    id: function(next) {
      var child = spawn('git', [ 'get-tar-commit-id' ], {
        stdio: 'pipe'
      });
      child.stdout.setEncoding('utf8');
      next(null, child);
    },
    
    // untar the archive
    tar: function(next) {
      next(null, spawn('tar', [ 'x',
        '--strip-components', dir.split('/').length
      ], {
        cwd: dest,
        stdio: 'pipe'
      }));
    },
    
    // fetch the staff directory and send data to "id" and "tar"
    archive: procs.concat(function(next, results) {
      var git = spawn('git', [ 'archive',
        '--remote', [ 'file:/', config.staff.repo ].join('/'), 'master', '--',
        dir
      ], {
        cwd: dest,
        stdio: 'pipe'
      });
      procs.forEach(function(proc) { git.stdout.pipe(results[proc].stdin); });
      
      // get staff repository revision
      var staffrev = '';
      results.id.stdin.on('error', function(err) { log.warn({ err: err }, 'ignoring id.stdin error'); });
      results.id.stdout.on('data', function(data) {
        staffrev += data;
        if (staffrev.length >= 7) { results.id.stdin.end(); }
      });
      
      // wait until all steps are complete
      var running = procs.length * 2;
      function done(code) {
        if (code != 0) {
          next({ dmesg: 'error fetching staff dir' });
        } else if (--running == 0) {
          next(staffrev.length > 0 ? null : { dmesg: 'error reading staff dir revision' }, staffrev);
        }
      }
      procs.forEach(function(proc) { results[proc].stdout.on('end', async.apply(done, 0)); });
      procs.forEach(function(proc) { results[proc].on('exit', done); });
    }),
    
    // find the latest revision for this directory
    staffrev: [ 'archive', function(next, results) {
      staffDirRevBefore(dir, results.archive.trim(), function(err, staffrev) {
        next(err, staffrev);
      });
    } ]
  }, function(err, results) {
    callback(err, results && results.staffrev && results.staffrev.substring(0, 7));
  });
};

// fetch staff build materials
// callback returns staff commit hash
exports.fetchBuilder = function(spec, dest, callback) {
  log.info({ spec: spec, dest: dest }, 'fetchBuilder');
  fetchStaffDir(builderDir(spec), dest, callback);
};

// find projects in the staff repository that have the materials required for release
exports.findReleasableProjects = function(callback) {
  var required = [ 'grading', 'starting' ];
  var projects = {};
  
  var find = byline(util.spawnAndLog('git', [ 'ls-tree',
    '-r', '-d', '--name-only', 'master', config.staff.semester
  ], {
    cwd: config.staff.repo,
    stdio: 'pipe'
  }).stdout, { encoding: 'utf8' });
  
  find.on('data', function(dir) {
    var parts = dir.split(path.sep);
    if (parts.length == 3) {
      // found potential /semester/kind/proj
      projects[dir] = 0;
    } else if (parts.length == 4 && required.indexOf(parts[3]) >= 0) {
      // found /semester/kind/proj/required
      projects[parts.slice(0, 3).join(path.sep)]++;
    }
  });
  find.on('end', function() {
    callback(null, Object.keys(projects).filter(function(key) {
      // does the project have all the required directories?
      return projects[key] == required.length;
    }).map(function(key) {
      var parts = key.split(path.sep);
      return { kind: parts[1], proj: parts[2] };
    }));
  });
};

exports.hasStartingRepo = function(spec, callback) {
  fs.exists(path.join(startingSourcePath(spec), 'HEAD'), async.apply(callback, null));
};

exports.createStartingRepo = function(spec, committer, callback) {
  log.info({ spec: spec }, 'createStartingRepo');
  var dest = startingSourcePath(spec);
  async.auto({
    
    // check that starting directory does not exist
    check: function(next, results) {
      fs.exists(dest, function(exists) {
        next(exists ? { dmesg: 'starting directory exists' } : null);
      });
    },
    
    // create staging repo directory
    staging: [ 'check', async.apply(temp.mkdir, 'didit-') ],
    
    // export starting code from staff repo into staging repo work dir
    fetch: [ 'staging', function(next, results) {
      fetchStaffDir(startingDir(spec), results.staging, next);
    } ],
    
    // create starting repo directory
    dir: [ 'fetch', async.apply(mkdirp, dest) ],
    
    // initialize starting repo
    init: [ 'dir', function(next) {
      async.eachSeries([
        [ 'init', '--quiet', '--bare' ],
        [ 'config', 'receive.denynonfastforwards', 'true' ]
      ], function(args, next) {
        util.onExit(util.spawnAndLog('git', args, {
          cwd: dest,
          stdio: 'pipe'
        }), next);
      }, next);
    } ],
    
    // commit starting code in staging and push to starting
    push: [ 'init', function(next, results) {
      var name = committer + ' via Didit';
      var email = committer + '@' + config.web.certDomain.toLowerCase();
      var env = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email,
                  GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
      async.eachSeries([
        [ 'init', '--quiet' ],
        [ 'add', '.' ],
        [ 'commit', '--quiet', '-m', 'Starting code for ' + spec.kind + '/' + spec.proj ],
        [ 'push', '--quiet', 'file://' + dest, 'master' ]
      ], function(args, next) {
        util.onExit(util.spawnAndLog('git', args, {
          cwd: results.staging,
          env: env,
          stdio: 'pipe'
        }), next);
      }, next);
    } ],
    
    // clean up unnecessary files
    cleanup: [ 'push', async.apply(async.auto, {
      rmDescription: async.apply(fs.unlink, path.join(dest, 'description')),
      sampleHooks: async.apply(glob, path.join(dest, 'hooks', '*.sample'), {}),
      rmSampleHooks: [ 'sampleHooks', function(next, results) {
        async.each(results.sampleHooks, fs.unlink, next);
      } ]
    }) ],
    
    // throw away staging
    remove: [ 'push', function(next, results) {
      setTimeout(function() {
        rimraf(results.staging, function(err) {
          if (err) { log.error(err, 'error removing staging directory'); }
        });
      }, 1000 * 60 * 60);
      next();
    } ]
  }, callback);
};

exports.createStudentRepo = function(spec, committer, callback) {
  log.info({ spec: spec }, 'createStudentRepo');
  var dest = studentSourcePath(spec);
  async.series([
    
    // check that repo does not exist
    function(next) {
      fs.exists(dest, function(exists) {
        next(exists ? { dmesg: 'repository exists' } : null);
      });
    },
    
    // copy starting repo
    async.apply(ncp, startingSourcePath(spec), dest),
    
    // add hooks
    async.apply(ncp, path.join(__dirname, 'hooks'), path.join(dest, 'hooks'))
    
  ], callback);
};

// command-line git
if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.join(' ').match(/^log \w+ \w+ [\w-]+/)) {
    log.info('git', args[0]);
    exports.studentSourceLog({
      kind: args[1], proj: args[2], users: args[3].split('-')
    }, args.slice(4), function(err, lines) {
      if (err) { log.error(err, 'error'); }
      log.info(lines, 'result');
    });
  } else {
    log.error('unknown command', args);
  }
}
