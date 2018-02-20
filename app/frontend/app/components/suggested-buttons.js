import Ember from 'ember';
import InboundActions from '../../ember-component-inbound-actions/inbound-actions';

export default Ember.Component.extend(InboundActions, {
	slideoutService: Ember.inject.service('slideout-service'),
	init:function() {
		this._super();
		this.set('slideout', null);
	},

	didInsertElement: function() {
		this._super();

		var newSlideout = new window.Slideout({
			'panel': Ember.$('#slideout-main-panel')[0],
			'menu': Ember.$('#menu')[0],
			'padding': 256,
			'tolerance': 70
		});

		this.set('slideout', newSlideout);

		Ember.$('#menu').css('padding-top', '70px');
	},

	toggleSlideout: function() {
		this.get('slideout').toggle();
	},

	subscribeToService: Ember.on('init', function() {
		this.get('slideoutService').on('toggleSlideout', this, this.toggleSlideout);
	}),
	unsubscribeToService: Ember.on('willDestroyElement', function() {
		this.get('slideoutService').off('toggleSlideout', this, this.toggleSlideout);
	}),
	actions: {
		addButton: function(button) {
			console.log(button);
		}
	}
});