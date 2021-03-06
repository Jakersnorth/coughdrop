import Ember from 'ember';
import app_state from '../utils/app_state';

export default Ember.Component.extend({
  tagName: 'span',
  licenseOptions: function() {
    return app_state.get('licenseOptions');
  }.property(),
  private_license: function() {
    return this.get('license.type') == 'private';
  }.property('license.type')
});
