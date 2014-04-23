var async = require('async');

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
