import Ember from 'ember';
import InboundActions from '../../ember-component-inbound-actions/inbound-actions';
import editManager from '../utils/edit_manager';

export default Ember.Component.extend(InboundActions, {
	slideoutService: Ember.inject.service('slideout-service'),
	//suggestionController: Ember.inject.controller('button-suggestions'),
	init:function() {
		this._super();
		this.set('slideout', null);
	},
	check_availability: function() {
		var rows = editManager.controller.get('ordered_buttons');
		var empty = 0;
		rows.forEach(function(row) {
			row.forEach(function(col) {
				if(col.empty) { empty++; }
			});
		});
		this.set('full', empty === 0);
		this.set('empty', empty);
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
			//this.get('suggestionController').send('add_item', button);
			this.check_availability();
			if(this.get('full')) { return; }
			var board = this.get('model.board');
			var spot = editManager.find_button('empty');
			if(spot) {
				editManager.change_button(spot.id, {
					label: button.label,
					sound: button.sound,
					sound_id: button.sound_id,
					external_id: button.external_id
				});
			} else {
				editManager.lucky_symbol(spot.id);
			}
		}
	}
});