var async = require('async');

var config = require('./config');
var builder = require('./builder');
var git = require('./git');
var mailer = require('./mailer');
var log = require('./logger').cat('outofband');

exports.notifyBuild = function(spec, buildId, listeners, options) {
  log.info({ spec: spec, listeners: listeners, options: options }, 'notifyBuild', buildId);
  var monitor = builder.monitor(buildId);
  async.auto({
    built: function(next) {
      var timer = setTimeout(function() {
        monitor.cancel();
        log.warn({ spec: spec }, 'no build after waiting');
        next(null);
      }, 1000 * 60 * 60);
      monitor.once('done', function(output) {
        clearTimeout(timer);
        monitor.cancel();
        next(null, output);
      });
    },
    build: [ 'built', function(next) {
      builder.findBuild(spec, function(err, build) {
        if (err) {
          log.error({ spec: spec }, 'error finding build');
        }
        next(null, build);
      });
    } ],
    changelog: function(next) {
      if (/^0+$/.test(options.oldrev)) {
        var range = [ spec.rev ];
      } else if (options.oldrev) {
        var range = [ options.oldrev + '..' + spec.rev ];
      } else {
        var range = [ '-1', spec.rev ];
      }
      git.studentSourceLog(spec, range, function(err, lines) {
        if (err) {
          log.error({ spec: spec }, 'error getting changelog');
        }
        next(null, lines);
      });
    }
  }, function(err, results) {
    log.info({ spec: spec, build: !!results.build, changelog: !!results.changelog }, 'sending mail');
    var subject = [ spec.kind, spec.proj, spec.users.join('-') ].join('/');
    mailer.sendMail({ to: spec.users, cc: listeners }, subject, 'build', {
      spec: spec,
      url: options.url,
      build: results.build,
      changelog: results.changelog
    }, function(err, result) {
      if (err) {
        log.error(err, 'error sending mail');
      }
    });
  });
};

exports.notifyGradeFromBuilds = async.apply(notifyGrade, function(params) {
  return 'by revision';
});
exports.notifyGradeFromSweep = async.apply(notifyGrade, function(params) {
  return 'from sweep ' + params.kind + '/' + params.proj + ' ' + params.datetime.format('llll');
});

function notifyGrade(assigned, params, accepts, user, callback) {
  notify(params.kind + '/' + params.proj + ' ' + params.name + ' grades assigned', 'graded', {
    params: params,
    user: user,
    usernames: accepts.map(function(accept) { return accept.users.join('-'); }),
    assigned: assigned(params)
  }, callback);
}

exports.notifyMilestoneRelease = function(params, user, callback) {
  notify(params.kind + '/' + params.proj + ' ' + params.name + ' grades released', 'released', {
    params: params,
    user: user
  }, callback);
};

exports.notifySweepStart = async.apply(notifySweep, 'Sweeping', 'sweep-start');
exports.notifySweepComplete = async.apply(notifySweep, 'Finished sweeping', 'sweep-complete');
exports.notifySweepRebuildStart = async.apply(notifySweep, 'Rebuilding sweep', 'rebuild-start');
exports.notifySweepRebuildComplete = async.apply(notifySweep, 'Finished rebuilding sweep', 'rebuild-complete');

function notifySweep(prefix, template, params, when, user, callback) {
  notify(prefix + ' ' + params.kind + '/' + params.proj + ' ' + when.format('llll'), template, {
    params: params,
    when: when,
    user: user
  }, callback);
}

function notify(subject, template, locals, callback) {
  if ( ! config.log.mail) { return; }
  mailer.sendMail({ to: config.log.mail }, subject, template, locals, function(err, result) {
    if (err) {
      log.error(err, 'error sending mail');
    }
    if (callback) {
      callback(err, result);
    }
  });
}
