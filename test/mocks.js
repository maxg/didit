const events = require('events');

const config = require('../src/config');

exports.HTTPS = function() {
  return new MockHTTPS();
};

function MockHTTPS() {
  this.email = undefined;
  this.listener = (req, res) => {
    req.connection.authorized = this.email !== undefined;
    req.connection.getPeerCertificate = () => {
      return { subject: { emailAddress: this.email } };
    };
  };
}

MockHTTPS.prototype.user = function(username) {
  this.email = username ? username + '@' + config.web.certDomain : undefined;
};

MockHTTPS.prototype.clear = function() {
  this.user();
};

exports.AWSHTTP = function() {
  return new MockAWSHttpClient();
};

function MockAWSHttpClient() {
  this.requests = [];
  this.events = new events.EventEmitter();
}

MockAWSHttpClient.prototype.handleRequest = function(req, opts, callback, errCallback) {
  let request = {
    body: JSON.parse(req.body),
    success: function() {
      let res = new events.EventEmitter();
      callback(res);
      res.emit('headers', 200, {});
      res.emit('end');
    }
  };
  this.requests.push(request);
  this.events.emit('request', request);
  return new events.EventEmitter();
};
