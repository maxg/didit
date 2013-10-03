var config = {
  css: [
    "reset.less", "scaffolding.less", "grid.less", "layouts.less",
    "type.less", "code.less", "labels-badges.less", "tables.less", "forms.less", "buttons.less",
    "button-groups.less", "navs.less", "navbar.less", "breadcrumbs.less", "alerts.less", "progress-bars.less",
    "modals.less", "accordion.less",
    "wells.less", "close.less", "utilities.less", "component-animations.less",
    "responsive-utilities.less", "responsive-767px-max.less", "responsive-768px-979px.less", "responsive-1200px-min.less", "responsive-navbar.less"
  ],
  js: [
    "bootstrap-transition.js", "bootstrap-modal.js", "bootstrap-button.js", "bootstrap-collapse.js"
  ]
};

module.exports = [ 'css', 'js' ].map(function(param) {
  return param + '=' + JSON.stringify(config[param]);
}).join('&');
