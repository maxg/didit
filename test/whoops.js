var request = require('request');

describe('whoops', function() {
  
  var config = require('../config');
  var whoops = require('../whoops');
  
  var host = 'localhost';
  
  before(function() {
    whoops.start();
  });
  
  after(function() {
    whoops.stop();
  });
  
  it('HTTP should redirect to HTTPS', function(done) {
    request({
      uri: 'http://' + host + ':' + config.web.redirect + '/',
      followRedirect: false
    }, function(err, res, body) {
      res.statusCode.should.equal(302);
      res.headers.location.should.equal('https://' + host + ':' + config.web.port + '/');
      done(err);
    });
  });
  
  it('HTTPS GET should show maintenance page', function(done) {
    request({
      uri: 'https://' + host + ':' + config.web.port + '/',
      strictSSL: false
    }, function(err, res, body) {
      res.headers['content-type'].should.match(/text\/html/);
      body.should.match(/down for maintenance/i);
      done(err);
    });
  });
  
  it('HTTPS POST should show maintenance message', function(done) {
    request({
      uri: 'https://' + host + ':' + config.web.port + '/',
      method: 'POST',
      strictSSL: false
    }, function(err, res, body) {
      res.headers['content-type'].should.eql('text/plain');
      body.should.match(/down for maintenance/i);
      done(err);
    });
  });
});
