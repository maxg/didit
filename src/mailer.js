const async = require('async');
const aws = require('aws-sdk');
const dns = require('dns');
const events = require('events');
const fs = require('fs');
const juice = require('juice');
const moment = require('moment');
const nodemailer = require('nodemailer');
nodemailer.htmltotext = require('nodemailer-html-to-text');
const os = require('os');
const path = require('path');
const pug = require('pug');

const config = require('./config');
let log;
process.nextTick(function() {
  // logger depends on us
  log = require('./logger').cat('mailer');
});

let emitter = new events.EventEmitter();
module.transport = false;

if (config.mail.transport && config.mail.sender && config.mail.domain) {
  if ( ! config.mail.owner) {
    log.error('missing mail owner');
  } else if (config.mail.transport == 'PICKUP') {
    module.transport = createTransport({
      transport: 'pickup',
      directory: config.mail.directory
    });
  } else if (config.mail.transport == 'SMTP') {
    module.transport = queuingTransport();
    dns.resolveMx(config.mail.domain, setSMTPTransport);
  } else if (config.mail.transport == 'SES') {
    module.transport = createTransport({
      transport: 'ses',
      accessKeyId: aws.config.credentials.accessKeyId,
      secretAccessKey: aws.config.credentials.secretAccessKey
    });
  } else {
    log.error('unknown mail transport', config.mail.transport);
  }
}

function createTransport(config) {
  let transport = nodemailer.createTransport(config);
  transport.use('compile', nodemailer.htmltotext.htmlToText({
    uppercaseHeadings: false
  }));
  return transport;
}

function queuingTransport() {
  return {
    sendMail(mail, callback) {
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
  let host = addresses.sort((a, b) => b.priority - a.priority)[0];
  log.info({ host: host.exchange }, 'mailer transport SMTP');
  module.transport = createTransport({
    transport: 'smtp',
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
  
  let filename = path.join(__dirname, '..', 'views', 'mails', template + '.pug');
  locals.config = config;
  locals.moment = moment;
  
  async.waterfall([
    async.apply(fs.readFile, filename, { encoding: 'utf8' }),
    function(data, next) {
      next(null, pug.compile(data, { filename })(locals));
    },
    function(html, next) {
      next(null, juice(html));
    },
    function(html, next) {
      let mail = {
        from: 'Didit <' + config.mail.sender + '>',
        replyTo: (recipients.to || []).map(domainize).join(', '),
        to: (recipients.to || []).map(domainize).join(', '),
        cc: (recipients.cc || []).map(domainize).join(', '),
        subject: '[didit] ' + subject,
        html
      };
      log.info({ to: mail.to, subject: mail.subject }, 'sending mail');
      module.transport.sendMail(mail, next);
    }
  ], function(err, result) {
    if (err) {
      log.error(err, 'error sending mail');
    }
    callback(err, result);
  });
};

// pick up mail delivered with the pickup transport
exports.pickup = function(result, callback) {
  if (config.mail.transport != 'PICKUP') {
    callback({ dmesg: 'not configured with pickup transport' });
    return;
  }
  if ( ! result.path) {
    callback({ dmesg: 'not delivered by pickup transport' });
    return;
  }
  fs.readFile(result.path, { encoding: 'utf8' }, callback);
};

// command-line email
if (require.main === module) {
  process.nextTick(function() { // log is not available yet
    let args = process.argv.slice(2);
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
