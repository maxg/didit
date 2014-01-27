var events = require('events');

var config = require('../config');

exports.HTTPS = function() {
  return new MockHTTPS();
};

function MockHTTPS() {
  var self = this;
  this.email = undefined;
  this.listener = function(req, res) {
    req.connection.authorized = self.email !== undefined;
    req.connection.getPeerCertificate = function() {
      return { subject: { emailAddress: self.email } };
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
}

MockAWSHttpClient.prototype.handleRequest = function(req, opts, callback, errCallback) {
  this.requests.push({
    body: JSON.parse(req.body),
    success: function() {
      var res = new events.EventEmitter();
      callback(res);
      res.emit('headers', 200, {});
      res.emit('end');
    }
  });
  return new events.EventEmitter();
};
