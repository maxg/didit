// return an object equality predicate that examines only the given keys
exports.equalityModulo = function equalityModulo(/* keys */) {
  var keys = Array.prototype.slice.call(arguments);
  return function(a, b) {
    return keys.every(function(key) { return a[key] == b[key]; });
  }
};

// subtract one array of objects from another using the given object equality predicate
exports.difference = function difference(equality, superset, subset) {
  return superset.filter(function(a) {
    return ! subset.some(function(b) {
      return equality(a, b);
    });
  });
};
