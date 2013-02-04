var async = require('async');
var byline = require('byline');
var spawn = require('child_process').spawn;

var config = require('./config');
var log = require('./logger').cat('git');

// spawn a process and log stderr
// options must include a 'pipe' setting for stderr
function spawnAndLog(command, args, options) {
  var child = spawn(command, args, options);
  byline(child.stderr).on('data', function(line) {
    log.error({ err: line, command: command, args: args, options: options });
  });
  return child;
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
        [ 'file:/', config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-') ].join('/') + '.git',
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
      var names = [ 'rev', 'author', 'authoremail', 'authortime', 'committer', 'committeremail', 'committertime', 'subject' ];
      var format = [ '%h', '%an', '%ae', '%at', '%cn', '%ce', '%ct', '%s' ].join('%x00')
      var lines = [];
      var out = byline(spawn('git', [ 'log',
        '-1', '--pretty=format:' + format
      ], {
        cwd: dest,
        stdio: 'pipe'
      }).stdout);
      out.on('data', function(line) {
        var res = {};
        line.split('\0').forEach(function(val, idx) { res[names[idx]] = val; });
        lines.push(res);
      });
      out.on('end', function() {
        next(null, lines[0]);
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
      var running = procs.length;
      function done(code) {
        if (code != 0) {
          next({ dmesg: 'error fetching builder' });
        } else if (--running == 0) {
          next(staffrev.length > 0 ? null : { dmesg: 'error reading builder revision' }, staffrev);
        }
      }
      procs.forEach(function(proc) { results[proc].on('exit', done); });
    }),
  }, function(err, results) {
    callback(err, results ? results.archive.substring(0, 7) : null);
  });
};
