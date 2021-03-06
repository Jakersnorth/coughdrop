import Ember from 'ember';

export default Ember.Service.extend(Ember.Evented, {
	emitToggleSlideout: function() {
		this.trigger('toggleSlideout');
	},
	emitAddButton: function(button) {
		this.trigger('slideoutAddButton', button);
	}
});