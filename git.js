var async = require('async');
var byline = require('byline');
var fs = require('fs');
var glob = require('glob');
var moment = require('moment');
var path = require('path');
var mkdirp = require('mkdirp');
var spawn = require('child_process').spawn;
var ncp = require('ncp');

var config = require('./config');
var log = require('./logger').cat('git');

var perm;
if (config.student.permission) {
  perm = require('./'+config.student.permission);
} else {
  perm = require('./default_permission');
}

function studentSourcePath(spec) {
  return [ config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-') ].join('/') + '.git';
}

function builderDir(spec) {
  return [ config.staff.semester, spec.kind, spec.proj, 'grading' ].join('/');
}

function startingDir(spec) {
  return [ config.staff.semester, spec.kind, spec.proj, 'starting' ].join('/');
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

// find all projects with a created starting repo
exports.findStartedProjects = function(callback) {
  glob(path.join(config.student.semester, '*', '*'), { cwd: config.student.repos },
    function(err, dirs) {
      callback(err, dirs.map(function(dir){
        var parts = dir.split(path.sep);
        return { kind: parts[1], proj: parts[2] };
      }));
    });
};

// find all the student repos matching a kind, project and/or users
exports.findStudentRepos = function(spec, callback) {
  var kind = spec.kind || '*';
  var proj = spec.proj || '*';
  var users = spec.users ? '?(*-)' + spec.users.join('-') + '?(-*)' : '*';
  log.info('findRepos', kind, proj, users);
  glob(path.join(config.student.semester, kind, proj, users + '.git', 'config'), {
    cwd: config.student.repos
  }, function(err, dirs) {
    if (err) {
      return callback({ dmesg: err.dmesg ? err.dmesg : 'Error finding student repos' });
    }
    callback(null, dirs.map(function(dir) {
      var parts = dir.split(path.sep);
      return { kind: parts[1], proj: parts[2], users: parts[3].split('.')[0].split('-') };
    }));
  });
};

// find which students have permission to copy the starting repo for a given kind and project
exports.findStudentPermissions = function(spec, callback) {
  log.info({ spec: spec }, 'findPermissions');
  glob(path.join(config.student.semester, spec.kind, spec.proj, '*' + '.git'), {
    cwd: config.student.repos
  }, function(err, dirs) {
    if (err) {
      return callback({ dmesg: err.dmesg ? err.dmesg : 'Error finding empty student repos' });
    }
    callback(null, dirs.map(function(dir) {
      // return just the usernames
      var parts = dir.split(path.sep);
      return parts[3].replace(/\.git/, '');
    }));
  });
};

// add permission for a single student
function addPermission(spec, user, callback) {
  var dir = path.join(config.student.repos, config.student.semester, spec.kind,
   spec.proj, user + '.git');
  fs.exists(dir, function(exists) {
    if ( ! exists) {
      return fs.mkdir(dir, callback);
    }
    callback();
  });
}

// add permission for students to create copies of the starting repo
exports.addStudentPermissions = function(spec, usernames, callback) {
  log.info({ spec: spec, usernames: usernames }, 'addStudentPermissions');
  //var baseDir = path.join(config.student.repos, config.student.semester, spec.kind, spec.proj);
  var tasks = [];
  for (var i = 0; i < usernames.length; i++) {
    tasks.push(async.apply(addPermission, spec, usernames[i]));
  }
  async.parallel(tasks, callback);
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

exports.staffDirRevBefore = function(dir, upto, callback) {
  findRev(config.staff.repo,
          [ 'rev-list', '--max-count=1', upto, '--', dir ],
          callback);
};


// fetch all projects in the staff repo
exports.findAvailableProjects = function(callback) {
  log.info('findAvailableProjects');
  // look only for directories in the current semester
  var find = spawnAndLog('git',
    [ 'ls-tree', '-r', '-d', '--name-only', 'master', config.staff.semester ], { 
    cwd: config.staff.repo, 
    stdio: 'pipe'
  });
  find.stdout.setEncoding('utf8');
  var results = [];
  find.stdout.on('data', function(data) {
    results = results.concat(data.split('\n'));
  });
  find.on('exit', function(code) {
    if (code != 0) {
      return callback({ dmesg: 'Error finding available projects in staff repository'});
    }
    var gradingProjects = [];
    var startingProjects = [];
    // sort results into projects with starting directories and projects with grading directories
    // is there a better way to do this? 
    results.map(function(result) {
      var parts = result.split(path.sep);
      var project = { kind: parts[1], proj: parts[2] };
      if (parts[3] == 'grading') {
        gradingProjects.push(project);
      }
      if (parts[3] == 'starting') {
        startingProjects.push(project);
      }
    });
    var finalResults = gradingProjects.filter(function(gProject) {
      return startingProjects.some(function(sProject) {
        return sProject.kind == gProject.kind && sProject.proj == gProject.proj;
      });
    });
    callback(null, gradingProjects.filter(function(gProject) {
      return startingProjects.some(function(sProject) {
        return sProject.kind == gProject.kind && sProject.proj == gProject.proj;
      });
    }));
  });
};

// fetch directory from staff repo
// callback returns staff commit hash
exports.exportStaffDir = function(dir, dest, callback) {
  log.info({ dir: dir, dest: dest }, 'exportStaffDir');
  //var dir = builderDir(spec);
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
    
    // untar the staff directory
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
      log.info('exportStaffDir', 'archive');
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
          next({ dmesg: 'error fetching directory' });
        } else if (--running == 0) {
          next(staffrev.length > 0 ? null : { dmesg: 'error reading directory revision' }, staffrev);
        }
      }
      procs.forEach(function(proc) { results[proc].stdout.on('end', async.apply(done, 0)); });
      procs.forEach(function(proc) { results[proc].on('exit', done); });
    }),
    
    // find the directory revision for this project
    staffrev: [ 'archive', function(next, results) {
      exports.staffDirRevBefore(dir, results.archive.trim(), function(err, staffrev) {
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
  exports.exportStaffDir(builderDir(spec), dest, callback);
};

// fetch starting repo
// callback returns staff commit hash
exports.fetchStarting = function(spec, dest, callback) {
  exports.exportStaffDir(startingDir(spec), dest, callback);
};

// create a function that runs the specified git command 
// callback returns true if successful
function gitCommand(gitargs, options, errmesg){
  return function(callback) {
    var cmd = spawnAndLog('git', gitargs, options);
    cmd.on('exit', function(code) {
      if (code != 0) {
        callback({ dmesg: errmesg }, null);
      } else {
        callback(null, true);
      }
    });
  }
}

// initialize starting repo, add starting files, and convert to a bare repo
function initStarting(dir, callback) {
  log.info({ dir: dir }, 'initStarting');
  var options = { cwd: dir, stdio: 'pipe' };
  async.series([
    gitCommand([ 'init', '-q' ], options, 'Error initializing repository'),
    gitCommand([ 'add', '.' ], options, 'Error adding starting files'), // this might not always work
    gitCommand([ 'commit', '-q', '-m', 'Commit starting code' ], options,
      'Error committing starting files'),
    gitCommand([ 'config', '--bool', 'core.bare', 'true' ], options,
      'Error converting to bare repository')
  ], callback);
}

// create starting repo
// callback returns commit hash of starting directory
exports.createStarting = function(spec, callback) {
  log.info({ spec: spec }, 'createStarting');
  var dir = path.join(config.student.repos, config.student.semester, spec.kind, spec.proj, 'starting');
  async.series([
    async.apply(mkdirp, dir),
    async.apply(exports.fetchStarting, spec, dir),
    async.apply(initStarting, dir),
    async.apply(perm.setStartingPermission, spec)
  ], callback);
};

// check if the starting repo has been created already
// callback returns only true or false
exports.startingExists = function(spec, callback) {
  log.info({ spec: spec }, 'startingExists');
  fs.exists(path.join(config.student.repos, config.student.semester, spec.kind, spec.proj,
   'starting'), function(exists) {
    callback(null, exists);
  });
};

// check if a student has permission to copy a given project
// callback returns the name of the repo that can be copied, or false if no permission
exports.checkPermission = function(spec, callback) {
  var user = '?(*-)' + spec.users + '?(-*)';
  glob(path.join(spec.kind, spec.proj, user + '.git'), { 
    cwd: path.join(config.student.repos, config.student.semester)
  }, function(err, files) {
      if (err) {
        return callback(err);
      }
      var result = files[0]
      if ( ! result){
        return callback(null, false);
      }
      // if there is permission, return a list of usernames 
      var users = result.split(path.sep)[2].replace(/\.git/, '').split('-');
      callback(null, users);
  });
}

// copy starting repo for a student
exports.copyStarting = function (spec, callback) {
  log.info({ spec: spec }, 'copyStarting');
  var source = path.join(config.student.repos, config.student.semester, spec.kind, spec.proj);
  var dest = path.join(source, spec.users.join('-') + '.git');
  var startingRepo = path.join(source, 'starting', '.git');
  async.series([ 
    async.apply(ncp, startingRepo, dest),
    async.apply(ncp, path.join(__dirname, 'hooks'), path.join(dest, 'hooks')),
    async.apply(perm.setStudentPermission, spec)
  ], callback);
}

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
