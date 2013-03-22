var async = require('async');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var moment = require('moment');
var path = require('path');

var config = require('./config');
var builder = require('./builder');
var git = require('./git');
var log = require('./logger').cat('sweeper');

function shuffle(ordered) {
  if (ordered.length == 0) { return []; }
  var shuffled = [ ordered[0] ];
  for (var ii = 1; ii < ordered.length; ii++) {
    var jj = Math.floor(Math.random() * (ii+1));
    shuffled[ii] = shuffled[jj];
    shuffled[jj] = ordered[ii];
  }
  return shuffled;
}

function sweepResultDir(spec, started) {
  started = moment(started).format(moment.compactFormat);
  return path.join(config.build.results, 'sweeps', config.student.semester, spec.kind, spec.proj, started);
}

function sweepResultFile(spec, started) {
  return path.join(sweepResultDir(spec, started), 'sweep.json');
}

exports.findSweeps = function(spec, callback) {
  log.info({ spec: spec }, 'findSweeps');
  var kind = spec.kind || '*';
  var proj = spec.proj || '*';
  glob(path.join('sweeps', config.student.semester, kind, proj, '*', 'sweep.json'), {
    cwd: config.build.results
  }, function(err, files) {
    callback(err, files.map(function(file) {
      var parts = file.split(path.sep);
      return { kind: parts[2], proj: parts[3], started: moment(parts[4], moment.compactFormat) };
    }));
  });
};

exports.findSweep = function(params, callback) {
  log.info({ params: params }, 'findSweep');
  fs.readFile(sweepResultFile(params, params.datetime), function(err, data) {
    if (err) {
      log.error({ params: params }, 'error reading sweep result file');
      callback(err, null);
      return;
    }
    callback(null, JSON.parse(data));
  });
};

exports.startSweep = function(spec, callback) {
  log.info({ spec: spec }, 'startSweep');
  var started = +new Date();
  async.auto({
    repos: function(next) {
      git.findStudentRepos(spec, function(err, repos) {
        callback(err, repos);
        next(err, repos);
      });
    },
    revisions: [ 'repos', function(next, results) {
      async.forEachLimit(shuffle(results.repos), config.build.concurrency || 2, function(spec, next) {
        git.studentSourceRev(spec, function(err, rev) {
          if (err) {
            log.warn({ spec: spec }, 'error getting revision');
          } else {
            log.info({ spec: spec }, 'got revision', rev);
          }
          spec.rev = rev || null;
          next();
        });
      }, function(err) { next(err); });
    } ],
    resultdir: [ 'revisions', function(next, results) {
      mkdirp(sweepResultDir(spec, started), next);
    } ],
    record: [ 'resultdir', function(next, results) {
      fs.writeFile(sweepResultFile(spec, started), JSON.stringify({
        spec: spec,
        started: started,
        finished: +new Date(),
        reporevs: results.repos
      }), function(err) { next(err); });
    } ],
    builder: [ 'record', git.builderRev ],
    builds: [ 'builder', function(next, results) {
      async.forEachSeries(results.repos, function(spec, next) {
        ensureBuild(spec, results.builder, next);
      }, function(err) { next(err); });
    } ]
  }, function(err) {
    if (err) { log.error(err, 'sweeping error'); }
  })
};

function ensureBuild(spec, staffrev, callback) {
  if ( ! spec.rev) {
    log.warn({ spec: spec }, 'no revision to build');
    return callback();
  }
  
  builder.findBuild(spec, function(err, build) {
    if (build && build.builder == staffrev) {
      log.info({ spec: spec }, 'already built with', staffrev);
      return callback();
    }
    
    log.info({ spec: spec }, 'need to build with', staffrev);
    builder.startBuild(spec, function(err) {
      if (err) { log.error({ err: err, spec: spec }, 'error starting build'); }
      return callback();
    });
  });
}
