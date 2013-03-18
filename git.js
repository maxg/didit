var async = require('async');
var byline = require('byline');
var spawn = require('child_process').spawn;

var config = require('./config');
var log = require('./logger').cat('git');

function studentSourcePath(spec) {
  return [ config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-') ].join('/') + '.git';
}

// spawn a process and log stderr
// options must include a 'pipe' setting for stderr
function spawnAndLog(command, args, options) {
  var child = spawn(command, args, options);
  byline(child.stderr).on('data', function(line) {
    log.error({ err: line, command: command, args: args, options: options });
  });
  return child;
}

// obtain commit log for student source
// callback returns an array of commit info objects
exports.studentSourceLog = function(spec, range, callback) {
  log.info({ spec: spec, range: range}, 'studentSourceLog');
  var names = [ 'rev', 'author', 'authoremail', 'authortime', 'committer', 'committeremail', 'committertime', 'subject' ];
  var format = [ '%h', '%an', '%ae', '%at', '%cn', '%ce', '%ct', '%s' ].join('%x00')
  var lines = [];
  var out = byline(spawnAndLog('git', [ 'log',
    '--pretty=format:' + format
  ].concat(range).concat([ '--' ]), {
    cwd: studentSourcePath(spec),
    stdio: 'pipe'
  }).stdout);
  out.on('data', function(line) {
    var res = {};
    line.split('\0').forEach(function(val, idx) { res[names[idx]] = val; });
    lines.push(res);
  });
  out.on('end', function() {
    callback(null, lines);
  });
}

// clone student source
// callback returns student commit metadata
exports.cloneStudentSource = function(spec, dest, callback) {
  log.info({ spec: spec, dest: dest }, 'cloneStudentSource');
  async.auto({
    
    // clone the student's repository
    clone: function(next) {
      log.info('cloneStudentSource', 'clone');
      spawnAndLog('git', [ 'clone',
        '--quiet', '--no-checkout', '--depth', '10', '--branch', 'master',
        'file://' + studentSourcePath(spec),
        '.'
      ], {
        cwd: dest,
        stdio: 'pipe'
      }).on('exit', function(code) {
        next(code == 0 ? null : { dmesg: 'error cloning source' });
      });
    },
    
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

// fetch staff build materials
// callback returns staff commit hash
exports.fetchBuilder = function(spec, dest, callback) {
  log.info({ spec: spec, dest: dest }, 'fetchBuilder');
  var pathParts = [ config.staff.semester, spec.kind, spec.proj, 'grading' ];
  var procs = [ 'id', 'tar' ];
  async.auto({
    
    // obtain the staff repository revision
    id: function(next) {
      next(null, spawn('git', [ 'get-tar-commit-id' ], {
        stdio: 'pipe'
      }));
    },
    
    // untar the staff builder
    tar: function(next) {
      next(null, spawn('tar', [ 'x',
        '--strip-components', pathParts.length
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
        pathParts.join('/')
      ], {
        cwd: dest,
        stdio: 'pipe'
      });
      procs.forEach(function(proc) { git.stdout.pipe(results[proc].stdin); });
      
      // get staff repository revision
      var staffrev = '';
      results.id.stdout.on('data', function(data) { staffrev += data; });
      
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
  }, function(err, results) {
    callback(err, results ? results.archive.substring(0, 7) : null);
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
