var async = require('async');
var byline = require('byline');
var spawn = require('child_process').spawn;

var config = require('./config');

// clone student source
// callback returns student commit metadata
exports.cloneStudentSource = function(spec, dest, callback) {
  console.log('[git]', 'cloneStudentSource', spec, dest);
  async.auto({
    
    // clone the student's repository
    clone: function(next) {
      console.log('[git]', 'cloneStudentSource', 'clone');
      spawn('git', [ 'clone',
        '--quiet', '--no-checkout', '--depth', '10', '--branch', 'master',
        [ 'file:/', config.student.repos, config.student.semester, spec.kind, spec.proj, spec.users.join('-') ].join('/') + '.git',
        '.'
      ], {
        cwd: dest
      }).on('exit', function(code) {
        next(code == 0 ? null : { dmesg: 'error cloning source' });
      });
    },
    
    // check out the specified revision
    checkout: [ 'clone', function(next) {
      console.log('[git]', 'cloneStudentSource', 'checkout');
      spawn('git', [ 'checkout',
        '--quiet', spec.rev
      ], {
        cwd: dest
      }).on('exit', function(code) {
        next(code == 0 ? null : { dmesg: 'error checking out source revision' });
      });
    } ],
    
    // obtain student revision metadata
    log: [ 'checkout', function(next) {
      console.log('[git]', 'cloneStudentSource', 'log');
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
  console.log('[git]', 'fetchBuilder', spec, dest);
  var pathParts = [ config.staff.semester, spec.kind, spec.proj, 'grading' ];
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
    archive: [ 'id', 'tar', function(next, results) {
      console.log('[git]', 'fetchBuilder', 'archive');
      var git = spawn('git', [ 'archive',
        '--remote', [ 'file:/', config.staff.repo ].join('/'), 'master', '--',
        pathParts.join('/')
      ], {
        cwd: dest,
        stdio: 'pipe'
      });
      git.stdout.pipe(results.id.stdin);
      git.stdout.pipe(results.tar.stdin);
      var staffrev = '';
      results.id.stdout.on('data', function(data) { staffrev += data; })
      results.tar.on('exit', function(code) {
        next(code == 0 ? null : { dmesg: 'error expanding builder' }, staffrev);
      })
    } ],
  }, function(err, results) {
    callback(err, results ? results.archive.substring(0, 7) : null);
  });
};
