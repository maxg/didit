var async = require('async');
var byline = require('byline');
var fs = require('fs');
var glob = require('glob');
var moment = require('moment');
var path = require('path');
var spawn = require('child_process').spawn;

var config = require('./config');
var log = require('./logger').cat('git');

function studentSourcePath(spec) {
  return [ config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-') ].join('/') + '.git';
}

function builderDir(spec) {
  return [ config.staff.semester, spec.kind, spec.proj, 'grading' ].join('/');
}

// spawn a process and log stderr
// options must include a 'pipe' setting for stderr
function spawnAndLog(command, args, options) {
  var child = spawn(command, args, options);
  child.on('error', function(err) {
    log.error({ err: err, command: command, args: args, options: options });
  });
  byline(child.stderr, { encoding: 'utf8' }).on('data', function(line) {
    log.error({ err: line, command: command, args: args, options: options });
  });
  return child;
}

function findRev(dir, gitargs, callback) {
  if ( ! fs.existsSync(dir)) {
    callback({ dmesg: 'no repository' });
    return;
  }
  var out = byline(spawnAndLog('git', gitargs, {
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
  log.info('findRepos', kind, proj, users);
  glob(path.join(config.student.semester, kind, proj, users + '.git'), {
    cwd: config.student.repos
  }, function(err, dirs) {
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
  var out = byline(spawnAndLog('git', [ 'log',
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
      var out = byline(spawnAndLog('git', [ 'rev-list',
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
      spawnAndLog('git', [ 'clone',
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
      spawnAndLog('git', [ 'checkout',
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
  findRev(config.staff.repo,
          [ 'rev-list', '--max-count=1', 'master', '--', builderDir(spec) ],
          callback);
};

exports.builderRevBefore = function(spec, upto, callback) {
  findRev(config.staff.repo,
          [ 'rev-list', '--max-count=1', upto, '--', builderDir(spec) ],
          callback);
};

// fetch staff build materials
// callback returns staff commit hash
exports.fetchBuilder = function(spec, dest, callback) {
  log.info({ spec: spec, dest: dest }, 'fetchBuilder');
  var dir = builderDir(spec);
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
    
    // untar the staff builder
    tar: function(next) {
      next(null, spawn('tar', [ 'x',
        '--strip-components', dir.split('/').length
      ], {
        cwd: dest,
        stdio: 'pipe'
      }));
    },
    
    // fetch the staff builder and send data to "id" and "tar"
    archive: procs.concat(function(next, results) {
      log.info('fetchBuilder', 'archive');
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
          next({ dmesg: 'error fetching builder' });
        } else if (--running == 0) {
          next(staffrev.length > 0 ? null : { dmesg: 'error reading builder revision' }, staffrev);
        }
      }
      procs.forEach(function(proc) { results[proc].stdout.on('end', async.apply(done, 0)); });
      procs.forEach(function(proc) { results[proc].on('exit', done); });
    }),
    
    // find the builder revision for this project
    staffrev: [ 'archive', function(next, results) {
      exports.builderRevBefore(spec, results.archive.trim(), function(err, staffrev) {
        next(err, staffrev);
      });
    } ]
  }, function(err, results) {
    callback(err, results ? results.staffrev.substring(0, 7) : null);
  });
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
