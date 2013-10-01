var async = require('async');
var aws = require('aws-sdk');
var dns = require('dns');
var events = require('events');
var fs = require('fs');
var jade = require('jade');
var juice = require('juice');
var moment = require('moment');
var nodemailer = require('nodemailer');
var os = require('os');
var path = require('path');

var config = require('./config');
var log;
process.nextTick(function() {
  // logger depends on us
  log = require('./logger').cat('mailer');
});

var emitter = new events.EventEmitter();
module.transport = false;

if (config.mail.transport && config.mail.sender && config.mail.domain) {
  if ( ! config.mail.owner) {
    log.error('missing mail owner');
  } else if (config.mail.transport == 'SMTP') {
    module.transport = queuingTransport();
    dns.resolveMx(config.mail.domain, setSMTPTransport);
  } else if (config.mail.transport == 'SES') {
    module.transport = nodemailer.createTransport('SES', {
      AWSAccessKeyID: aws.config.credentials.accessKeyId,
      AWSSecretKey: aws.config.credentials.secretAccessKey
    });
  } else {
    log.error('unknown mail transport', config.mail.transport);
  }
}

function queuingTransport() {
  return {
    sendMail: function(mail, callback) {
      log.info('queuing mail for later transport');
      emitter.once('transport', function() {
        module.transport.sendMail(mail, callback);
      });
    }
  };
}

function setSMTPTransport(err, addresses) {
  if (err) {
    log.error(err, 'error resolving MX ' + config.mail.domain);
    return;
  }
  var host = addresses.sort(function(a, b) {
    return b.priority - a.priority;
  })[0];
  log.info({ host: host.exchange }, 'mailer transport SMTP');
  module.transport = nodemailer.createTransport('SMTP', {
    host: host.exchange
  });
  emitter.emit('transport');
}

function domainize(user) {
  if (config.mail.debug) {
    user = config.mail.debug + '+' + user;
  }
  return user + '@' + config.mail.domain;
}

// send email
// renders template with locals, sends to recipients
exports.sendMail = function(recipients, subject, template, locals, callback) {
  if (module.transport == false) {
    callback({ dmesg: 'no mailer transport' });
    return;
  }
  
  var filename = path.join(__dirname, 'views', 'mails', template + '.jade');
  locals.config = config;
  locals.moment = moment;
  
  async.waterfall([
    async.apply(fs.readFile, filename, { encoding: 'utf8' }),
    function(data, next) {
      next(null, jade.compile(data, { filename: filename })(locals));
    },
    function(html, next) {
      juice.juiceContent(html, { url: path.join(__dirname, 'public') }, next);
    },
    function(html, next) {
      var mail = {
        from: 'Didit <' + config.mail.sender + '>',
        replyTo: (recipients.to || []).map(domainize).join(', '),
        to: (recipients.to || []).map(domainize).join(', '),
        cc: (recipients.cc || []).map(domainize).join(', '),
        subject: '[didit] ' + subject,
        html: html,
        generateTextFromHTML: true
      };
      log.info({ to: mail.to, subject: mail.subject }, 'sending mail');
      module.transport.sendMail(mail, next);
    }
  ], function(err, result) {
    if (err) {
      log.error(err, 'error sending mail');
    }
    callback(err, result && result.message);
  });
};

// command-line email
if (require.main === module) {
  process.nextTick(function() { // log is not available yet
    var args = process.argv.slice(2);
    log.info('manual email', args);
    if ( ! args.join(' ').match(/^[\w,]+ \w+ \{.+\}$/)) {
      log.error('expected arguments: <user>(,<user)* <template> <json>');
      return;
    }
    exports.sendMail({ to: args[0].split(',') }, args[1] + ' test mail', args[1], JSON.parse(args[2]),
      function(err, result) {
        if (err) { log.error(err, 'error'); }
        log.info(result, 'result');
      }
    );
  });
}
