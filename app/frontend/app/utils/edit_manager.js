import Ember from 'ember';
import CoughDrop from '../app';
import Button from './button';
import stashes from './_stashes';
import app_state from './app_state';
import contentGrabbers from './content_grabbers';
import modal from './modal';
import persistence from './persistence';
import progress_tracker from './progress_tracker';
import word_suggestions from './word_suggestions';
import i18n from './i18n';
import {stemmer} from './PorterStemmer1980';

var editManager = Ember.Object.extend({
  setup: function(board) {
    editManager.Button = Button;
    this.controller = board;
    this.set('app_state', app_state);
    if(app_state.controller) {
      app_state.controller.addObserver('dragMode', function() {
        if(editManager.controller == board) {
          var newMode = app_state.controller.get('dragMode');
          if(newMode != editManager.dragMode) {
            editManager.set('dragMode', newMode);
          }
        }
      });
    }
    this.set('dragMode', false);
    var edit = stashes.get('current_mode') == 'edit';
    if(this.auto_edit.edits && this.auto_edit.edits[board.get('model.id')]) {
      edit = true;
      this.auto_edit.edits[board.get('model.id')] = false;
      stashes.persist('current_mode', 'edit');
    }
    this.swapId = null;
    this.stashedButtonToApply = null;
    this.clear_history();
    console.log("Title!!!!! " + this.controller.get('model.name'));
    this.set('suggestion_id', 9000);
    this.fetch_suggestions(this.controller.get('model.name'), this.controller.get('ordered_buttons'));
  },
  set_drag_mode: function(enable) {
    if(app_state.controller) {
      app_state.controller.set('dragMode', enable);
    }
  },
  edit_mode_triggers: function() {
    if(this.controller && this.lucky_symbol.pendingSymbols && app_state.get('edit_mode')) {
      this.lucky_symbols(this.lucky_symbol.pendingSymbols);
      this.lucky_symbol.pendingSymbols = [];
    }

  }.observes('app_state.edit_mode'),
  start_edit_mode: function() {
    var app = app_state.controller;
    //alert('starting edit mode!!!!');
    console.log('title: ' + app_state.get('name'));
    console.log('buttons: ' + this.controller.get('ordered_buttons'));
    if(!app_state.get('edit_mode')) {
      if(app_state.get('speak_mode') && app_state.get('currentUser.preferences.require_speak_mode_pin') && app_state.get('currentUser.preferences.speak_mode_pin')) {
        modal.open('speak-mode-pin', {actual_pin: app_state.get('currentUser.preferences.speak_mode_pin'), action: 'edit'});
      } else if(app_state.get('currentUser.preferences.long_press_edit')) {
        app.toggleMode('edit');
      }
    }
  },
  auto_edit: function(id) {
    // used to auto-enter edit mode after creating a brand new board
    this.auto_edit.edits = (this.auto_edit.edits || {});
    this.auto_edit.edits[id] = true;
  },
  clear_history: function() {
    this.setProperties({
      'history': [],
      'future': []
    });
    this.lastChange = {};
    this.bogus_id_counter = 0;
    if(this.controller && this.controller.get('ordered_buttons')) {
      var neg_ids = [0];
      this.controller.get('ordered_buttons').forEach(function(row) {
        row.forEach(function(btn) {
          var num_id = parseInt(btn.get('id'), 10) || 0;
          if(num_id < 0 && isFinite(num_id)) {
            neg_ids.push(num_id);
          }
        });
      });
      this.bogus_id_counter = (Math.min.apply(null, neg_ids) || -999);
    }
  },
  update_history: function() {
    if(this.controller) {
      this.controller.set('noRedo', this.get('future').length === 0);
      this.controller.set('noUndo', this.get('history').length === 0);
    }
  }.observes('history', 'history.[]', 'future', 'future.[]'),
  // TODO: should we be using this to ensure modifying proper board?
//   forBoard: function(board, callback) {
//     if(this.controller.get('model.id') == board.get('id')) {
//       callback();
//     }
//   },
  clear_text_edit: function() {
    this.lastChange = {};
  },
  save_state: function(details) {
    // TODO: needs revisit
    // currently if you reset state to exactly what it was before it'll still add to undo history. this is dumb.
    // also if I change the label, then change the color on the same button, only counts as one undo event. is that dumb? unsure.
    this.set('future', []);
    if(details && this.lastChange && details.button_id == this.lastChange.button_id && details.changes && JSON.stringify(details.changes) == JSON.stringify(this.lastChange.changes)) {
      // don't add to state if it's the same as the previous edit (i.e. add'l change to label)
    } else if(details && this.lastChange && details.mode == 'paint' && details.paint_id == this.lastChange.paint_id) {
      // don't add to state if it's the same paint as the previous edit.
    } else {
      this.get('history').pushObject(this.clone_state());
    }
    this.lastChange = details;
  },
  clone_state: function() {
    if(!this.controller) { return; }
    var oldState = this.controller.get('ordered_buttons');
    var board = this.controller.get('model');
    var clone_state = [];
    for(var idx = 0; idx < oldState.length; idx++) {
      var arr = [];
      for(var jdx = 0; jdx < oldState[idx].length; jdx++) {
        var b = editManager.Button.create(oldState[idx][jdx].raw());
        b.set('id', oldState[idx][jdx].get('id'));
        b.set('pending', false);
        b.set('board', board);
        arr.push(b);
      }
      clone_state.push(arr);
    }
    return clone_state;
  },
  undo: function() {
    if(!this.controller) { return; }
    var lastState = this.get('history').popObject();
    if(lastState) {
      var currentState = this.clone_state();
      this.get('future').pushObject(currentState);
      this.controller.set('ordered_buttons', lastState);
    }
  },
  redo: function() {
    if(!this.controller) { return; }
    var state = this.get('future').popObject();
    if(state) {
      var currentState = this.clone_state();
      this.get('history').pushObject(currentState);
      this.controller.set('ordered_buttons', state);
    }
  },
  bogus_id_counter: 0,
  fake_button: function() {
    var button = editManager.Button.create({
      empty: true,
      label: '',
      id: --this.bogus_id_counter
    });
    var controller = this.controller;
    var board = controller.get('model');
    button.set('board', board);
    return button;
  },
  modify_size: function(type, action, index) {
    this.save_state({
    });
    var state = this.controller.get('ordered_buttons');
    var newState = [];
    var fakeRow = [];
    if(type == 'column') {
      if(index == null) {
        index = (action == 'add' ? state[0].length : state[0].length - 1);
      }
    } else {
      if(index == null) {
        index = (action == 'add' ? state.length : state.length - 1);
      }
      for(var idx = 0; idx < state[0].length; idx++) {
        fakeRow.push(this.fake_button());
      }
    }
    for(var idx = 0; idx < state.length; idx++) {
      var row = [];
      if(index == idx && action == 'add' && type == 'row') {
        newState.push(fakeRow);
      }
      if(index == idx && action == 'remove' && type == 'row') {
      } else {
        for(var jdx = 0; jdx < state[idx].length; jdx++) {
          if(jdx == index && action == 'add' && type == 'column') {
            row.push(this.fake_button());
          }
          if(jdx == index && action == 'remove' && type == 'column') {
          } else {
            row.push(state[idx][jdx]);
          }
        }
        if(index == state[0].length && action == 'add' && type == 'column') {
          row.push(this.fake_button());
        }
        if(row.length === 0) { row.push(this.fake_button()); }
        newState.push(row);
      }
    }
    if(index == state.length && action == 'add' && type == 'row') {
      newState.push(fakeRow);
    }
    if(newState.length === 0) { newState.push(fakeRow); }
    this.controller.set('ordered_buttons', newState);
  },
  find_button: function(id) {
    var ob = this.controller.get('ordered_buttons') || [];
    for(var idx = 0; idx < ob.length; idx++) {
      for(var jdx = 0; jdx < ob[idx].length; jdx++) {
        if(id && ob[idx][jdx].id == id) {
          return ob[idx][jdx];
        } else if(id == 'empty' && ob[idx][jdx].empty) {
          return ob[idx][jdx];
        }
      }
    }
    var res = null;
    var board = this.controller.get('model');
    if(board.get('fast_html')) {
      board.get('buttons').forEach(function(b) {
        if(id && id == b.id) {
          res = editManager.Button.create(b, {board: board});
        }
      });
    }
    return res;
  },
  clear_button: function(id) {
    var opts = {};
    for(var idx = 0; idx < editManager.Button.attributes.length; idx++) {
      opts[editManager.Button.attributes[idx]] = null;
    }
    opts.label = '';
    opts.image = null;
    opts.local_image_url = null;
    opts.local_sound_url = null;
    opts.image_style = null;
    this.change_button(id, opts);
  },
  change_button: function(id, options) {
    this.save_state({
      button_id: id,
      changes: Object.keys(options)
    });
    var button = this.find_button(id);
    if(button) {
      Ember.set(button, 'local_image_url', null);
      Ember.set(button, 'local_sound_url', null);
      for(var key in options) {
        Ember.set(button, key, options[key]);
      }
      this.check_button(id);
      console.log("Changed button - new ordered_buttons: " + this.controller.get('ordered_buttons'));
      this.fetch_suggestions(this.controller.get('model.name'), this.controller.get('ordered_buttons'));
    } else {
      console.log("no button found for: " + id);
    }
  },
  check_button: function(id) {
    var button = this.find_button(id);
    var empty = !button.label && !button.image_id;
    Ember.set(button, 'empty', !!empty);
  },
  stash_button: function(id) {
    var list = stashes.get_object('stashed_buttons', true) || [];
    var button = null;
    if(id && id.raw) {
      button = id.raw();
    } else {
      button = this.find_button(id);
      button = button && button.raw();
    }
    if(button) {
      delete button.id;
      button.stashed_at = (new Date()).getTime();
    }
    if(button && list[list.length - 1] != button) {
      list.pushObject(button);
    }
    stashes.persist('stashed_buttons', list);
  },
  get_ready_to_apply_stashed_button: function(button) {
    if(!button || !button.raw) {
      console.error("raw buttons won't work");
    } else if(button) {
      this.stashedButtonToApply = button.raw();
      this.controller.set('model.finding_target', true);
    }
  },
  apply_stashed_button: function(id) {
    if(this.stashedButtonToApply) {
      this.change_button(id, this.stashedButtonToApply);
      this.stashedButtonToApply = null;
    }
  },
  finding_target: function() {
    return this.swapId || this.stashedButtonToApply;
  },
  apply_to_target: function(id) {
    if(this.swapId) {
      this.switch_buttons(id, this.swapId);
    } else if(this.stashedButtonToApply) {
      this.apply_stashed_button(id);
    }
    this.controller.set('model.finding_target', false);
  },
  prep_for_swap: function(id) {
    var button = this.find_button(id);
    if(button) {
      button.set('for_swap', true);
      this.swapId = id;
      this.controller.set('model.finding_target', true);
    }
  },
  switch_buttons: function(a, b, decision) {
    if(a == b) { return; }
    this.save_state();
    var buttona = this.find_button(a);
    var buttonb = this.find_button(b);
    if(!buttona || !buttonb) { console.log("couldn't find a button!"); return; }
    if(buttonb.get('folderAction') && !decision) {
      buttona = buttona && editManager.Button.create(buttona.raw());
      buttona.set('id', a);
      buttonb = buttonb && editManager.Button.create(buttonb.raw());
      buttonb.set('id', b);
      modal.open('swap-or-drop-button', {button: buttona, folder: buttonb});
      return;
    }
    var ob = this.controller.get('ordered_buttons');
    for(var idx = 0; idx < ob.length; idx++) {
      for(var jdx = 0; jdx < ob[idx].length; jdx++) {
        if(ob[idx][jdx].id == a) {
          ob[idx][jdx] = buttonb;
        } else if(ob[idx][jdx].id == b) {
          ob[idx][jdx] = buttona;
        }
      }
    }
    buttona.set('for_swap', false);
    buttonb.set('for_swap', false);
    this.swapId = null;
    this.controller.set('ordered_buttons', ob);
    this.controller.redraw_if_needed();
  },
  move_button: function(a, b, decision) {
    var button = this.find_button(a);
    var folder = this.find_button(b);
    if(button) {
      button = editManager.Button.create(button.raw());
    }
    if(!button || !folder) { return Ember.RSVP.reject({error: "couldn't find a button"}); }
    if(!folder.load_board || !folder.load_board.key) { return Ember.RSVP.reject({error: "not a folder!"}); }
    this.clear_button(a);

    var find = CoughDrop.store.findRecord('board', folder.load_board.key).then(function(ref) {
      return ref;
    });
    var reload = find.then(function(ref) {
      return ref.reload();
    });
    var _this = this;
    var ready_for_update = reload.then(function(ref) {
      if(ref.get('permissions.edit')) {
        return Ember.RSVP.resolve(ref);
      } else if(ref.get('permissions.view')) {
        if(decision == 'copy') {
          return ref.create_copy().then(function(copy) {
            _this.change_button(b, {
              load_board: {id: copy.get('id'), key: copy.get('key')}
            });
            return copy;
          });
        } else {
          return Ember.RSVP.reject({error: 'view only'});
        }
      } else {
        return Ember.RSVP.reject({error: 'not authorized'});
      }
    });

    var new_id;
    var update_buttons = ready_for_update.then(function(board) {
      new_id = board.add_button(button);
      return board.save();
    });

    return update_buttons.then(function(board) {
      return Ember.RSVP.resolve({visible: board.button_visible(new_id), button: button});
    });
  },
  paint_mode: null,
  set_paint_mode: function(fill_color, border_color, part_of_speech) {
    if(fill_color == 'hide') {
      this.paint_mode = {
        hidden: true,
        paint_id: Math.random()
      };
    } else if(fill_color == 'show') {
      this.paint_mode = {
        hidden: false,
        paint_id: Math.random()
      };
    } else if(fill_color == 'close') {
      this.paint_mode = {
        close_link: true,
        paint_id: Math.random()
      };
    } else if(fill_color == 'open') {
      this.paint_mode = {
        close_link: false,
        paint_id: Math.random()
      };
    } else {
      var fill = window.tinycolor(fill_color);
      var border = null;
      if(border_color) {
        border = window.tinycolor(border_color);
      } else {
        border = window.tinycolor(fill.toRgb()).darken(30);
        if(fill.toName() == 'white') {
          border = window.tinycolor('#eee');
        } else if(fill.toHsl().l < 0.5) {
          border = window.tinycolor(fill.toRgb()).lighten(30);
        }
      }
      this.paint_mode = {
        border: border.toRgbString(),
        fill: fill.toRgbString(),
        paint_id: Math.random(),
        part_of_speech: part_of_speech
      };
    }
    this.controller.set('paint_mode', this.paint_mode);
  },
  clear_paint_mode: function() {
    this.paint_mode = null;
    if(this.controller) {
      this.controller.set('paint_mode', false);
    }
  },
  release_stroke: function() {
    if(this.paint_mode) {
      this.paint_mode.paint_id = Math.random();
    }
  },
  paint_button: function(id) {
    this.save_state({
      mode: 'paint',
      paint_id: this.paint_mode.paint_id,
      button_id: id
    });
    var button = this.find_button(id);
    if(this.paint_mode.border) {
      Ember.set(button, 'border_color', this.paint_mode.border);
    }
    if(this.paint_mode.fill) {
      Ember.set(button, 'background_color', this.paint_mode.fill);
    }
    if(this.paint_mode.hidden != null) {
      Ember.set(button, 'hidden', this.paint_mode.hidden);
    }
    if(this.paint_mode.close_link != null) {
      Ember.set(button, 'link_disabled', this.paint_mode.close_link);
    }
    if(this.paint_mode.part_of_speech) {
      if(!Ember.get(button, 'part_of_speech') || Ember.get(button, 'part_of_speech') == Ember.get(button, 'suggested_part_of_speech')) {
        Ember.set(button, 'part_of_speech', this.paint_mode.part_of_speech);
        Ember.set(button, 'painted_part_of_speech', this.paint_mode.part_of_speech);
      }
    }
    this.check_button(id);
  },
  process_for_displaying: function() {
    CoughDrop.log.track('processing for displaying');
    var controller = this.controller;
    var board = controller.get('model');
    var buttons = board.translated_buttons(app_state.get('label_locale'), app_state.get('vocalization_locale'));
    var grid = board.get('grid');
    if(!grid) { return; }
    var allButtonsReady = true;
    var _this = this;
    var result = [];
    var pending_buttons = [];
    var used_button_ids = {};

    CoughDrop.log.track('process word suggestions');
    if(controller.get('model.word_suggestions')) {
      controller.set('suggestions', {loading: true});
      word_suggestions.load().then(function() {
        controller.set('suggestions', {ready: true});
        controller.updateSuggestions();
      }, function() {
        controller.set('suggestions', {error: true});
      });
    }

    // new workflow:
    // - get all the associated image and sound ids
    // - if the board was loaded remotely, they should all be peekable
    // - if they're not peekable, do a batch lookup in the local db
    //   NOTE: I don't think it should be necessary to push them into the
    //   ember-data cache, but maybe do that as a background job or something?
    // - if any *still* aren't reachable, mark them as broken
    // - do NOT make remote requests for the individual records???


    var resume_scanning = function() {
      Ember.run.later(function() {
        if(app_state.controller) {
          app_state.controller.send('highlight_button');
        }
      });
      if(app_state.controller) {
        app_state.controller.send('check_scanning');
      }
    };

    if(app_state.get('speak_mode') && app_state.get('feature_flags.fast_render')) {
      controller.update_button_symbol_class();
      if(board.get('fast_html') && board.get('fast_html.width') == controller.get('width') && board.get('fast_html.height') == controller.get('height') && board.get('current_revision') == board.get('fast_html.revision')) {
        CoughDrop.log.track('already have fast render');
        resume_scanning();
        return;
      } else {
        board.set('fast_html', null);
        board.add_classes();
        CoughDrop.log.track('trying fast render');
        var fast = board.render_fast_html({
          height: controller.get('height'),
          width: controller.get('width'),
          extra_pad: controller.get('extra_pad'),
          inner_pad: controller.get('inner_pad'),
          base_text_height: controller.get('base_text_height'),
          button_symbol_class: controller.get('button_symbol_class')
        });

        if(fast && fast.html) {
          board.set('fast_html', fast);
          resume_scanning();
          return;
        }
      }
    }

    // build the ordered grid
    // TODO: work without ordered grid (i.e. scene displays)
    CoughDrop.log.track('finding content locally');
    var prefetch = board.find_content_locally().then(null, function(err) {
      return Ember.RSVP.resolve();
    });


    var image_urls = board.get('image_urls');
    var sound_urls = board.get('sound_urls');
    prefetch.then(function() {
      CoughDrop.log.track('creating buttons');
      for(var idx = 0; idx < grid.rows; idx++) {
        var row = [];
        for(var jdx = 0; jdx < grid.columns; jdx++) {
          var button = null;
          var id = (grid.order[idx] || [])[jdx];
          for(var kdx = 0; kdx < buttons.length; kdx++) {
            if(id !== null && id !== undefined && buttons[kdx].id == id && !used_button_ids[id]) {
              // only allow each button id to be used once, even if referenced more than once in the grid
              // TODO: if a button is references more than once in the grid, probably clone
              // it for the second reference or something rather than just ignoring it. Multiply-referenced
              // buttons do weird things when in edit mode.
              used_button_ids[id] = true;
              var more_args = {board: board};
              if(board.get('no_lookups')) {
                more_args.no_lookups = true;
              }
              if(image_urls) {
                more_args.image_url = image_urls[buttons[kdx]['image_id']];
              }
              if(sound_urls) {
                more_args.sound_url = sound_urls[buttons[kdx]['sound_id']];
              }
              button = editManager.Button.create(buttons[kdx], more_args);
            }
          }
          button = button || _this.fake_button();
          if(!button.everything_local()) {
            allButtonsReady = false;
            pending_buttons.push(button);
          }
          row.push(button);
        }
        result.push(row);
      }
      if(!allButtonsReady) {
        CoughDrop.log.track('need to wait for buttons');
        board.set('pending_buttons', pending_buttons);
        board.addObserver('all_ready', function() {
          if(!controller.get('ordered_buttons')) {
            board.set('pending_buttons', null);
            controller.set('ordered_buttons',result);
            CoughDrop.log.track('redrawing if needed');
            controller.redraw_if_needed();
            CoughDrop.log.track('done redrawing if needed');
            resume_scanning();
          }
        });
        controller.set('ordered_buttons', null);
      } else {
        CoughDrop.log.track('buttons did not need waiting');
        controller.set('ordered_buttons', result);
        CoughDrop.log.track('redrawing if needed');
        controller.redraw_if_needed();
        CoughDrop.log.track('done redrawing if needed');
        resume_scanning();
        for(var idx = 0; idx < result.length; idx++) {
          for(var jdx = 0; jdx < result[idx].length; jdx++) {
            var button = result[idx][jdx];
            if(button.get('suggest_symbol')) {
              _this.lucky_symbol(button.id);
            }
          }
        }
      }
    }, function(err) {
      console.log(err);
    });
  },
  process_for_saving: function() {
    var orderedButtons = this.controller.get('ordered_buttons');
    var priorButtons = this.controller.get('model.buttons');
    var gridOrder = [];
    var newButtons = [];
    var maxId = 0;
    for(var idx = 0; idx < priorButtons.length; idx++) {
      maxId = Math.max(maxId, parseInt(priorButtons[idx].id, 10) || 0);
    }

    for(var idx = 0; idx < orderedButtons.length; idx++) {
      var row = orderedButtons[idx];
      var gridRow = [];
      for(var jdx = 0; jdx < row.length; jdx++) {
        var currentButton = row[jdx];
        var originalButton = null;
        for(var kdx = 0; kdx < priorButtons.length; kdx++) {
          if(priorButtons[kdx].id == currentButton.id) {
            originalButton = priorButtons[kdx];
          }
        }
        var newButton = Ember.$.extend({}, originalButton);
        if(currentButton.label || currentButton.image_id) {
          newButton.label = currentButton.label;
          if(currentButton.vocalization && currentButton.vocalization != newButton.label) {
            newButton.vocalization = currentButton.vocalization;
          } else {
            delete newButton['vocalization'];
          }
          newButton.image_id = currentButton.image_id;
          newButton.sound_id = currentButton.sound_id;
          var bg = window.tinycolor(currentButton.background_color);
          if(bg._ok) {
            newButton.background_color = bg.toRgbString();
          }
          var border = window.tinycolor(currentButton.border_color);
          if(border._ok) {
            newButton.border_color = border.toRgbString();
          }
          newButton.hidden = !!currentButton.hidden;
          newButton.link_disabled = !!currentButton.link_disabled;
          newButton.add_to_vocalization = !!currentButton.add_to_vocalization;
          newButton.home_lock = !!currentButton.home_lock;
          newButton.hide_label = !!currentButton.hide_label;
          newButton.blocking_speech = !!currentButton.blocking_speech;
          if(currentButton.get('translations.length') > 0) {
            newButton.translations = currentButton.get('translations');
          }
          if(currentButton.get('external_id')) {
            newButton.external_id = currentButton.get('external_id');
          }
          if(currentButton.part_of_speech) {
            newButton.part_of_speech = currentButton.part_of_speech;
            newButton.suggested_part_of_speech = currentButton.suggested_part_of_speech;
            newButton.painted_part_of_speech = currentButton.painted_part_of_speech;
          }
          if(currentButton.get('buttonAction') == 'talk') {
            delete newButton['load_board'];
            delete newButton['apps'];
            delete newButton['url'];
            delete newButton['integration'];
          } else if(currentButton.get('buttonAction') == 'link') {
            delete newButton['load_board'];
            delete newButton['apps'];
            delete newButton['integration'];
            newButton.url = currentButton.get('fixed_url');
            if(currentButton.get('video')) {
              newButton.video = currentButton.get('video');
            } else if(currentButton.get('book')) {
              newButton.book = currentButton.get('book');
            }
          } else if(currentButton.get('buttonAction') == 'app') {
            delete newButton['load_board'];
            delete newButton['url'];
            delete newButton['integration'];
            newButton.apps = currentButton.get('apps');
            if(newButton.apps.web && newButton.apps.web.launch_url) {
              newButton.apps.web.launch_url = currentButton.get('fixed_app_url');
            }
          } else if(currentButton.get('buttonAction') == 'integration') {
            delete newButton['load_board'];
            delete newButton['apps'];
            delete newButton['url'];
            newButton.integration = currentButton.get('integration');
          } else {
            delete newButton['url'];
            delete newButton['apps'];
            delete newButton['integration'];
            newButton.load_board = currentButton.load_board;
          }
          // newButton.top = ...
          // newButton.left = ...
          // newButton.width = ...
          // newButton.height = ...
          if(newButton.id < 0 || !newButton.id) {
            newButton.id = ++maxId;
          }
          newButton.id = newButton.id || ++maxId;
          for(var key in newButton) {
            if(newButton[key] === undefined) {
              delete newButton[key];
            }
          }
          newButtons.push(newButton);
          gridRow.push(newButton.id);
        } else {
          gridRow.push(null);
        }
      }
      gridOrder.push(gridRow);
    }
    return {
      grid: {
        rows: gridOrder.length,
        columns: gridOrder[0].length,
        order: gridOrder
      },
      buttons: newButtons
    };
  },
  lucky_symbols: function(ids) {
    var _this = this;
    ids.forEach(function(id) {
      var board_id = _this.controller.get('model.id');
      var button = _this.find_button(id);
      if(button && button.label && !button.image && !button.local_image_url) {
        button.set('pending_image', true);
        button.set('pending', true);
        if(button && button.label && !button.image) {
          button.check_for_parts_of_speech();
        }
        contentGrabbers.pictureGrabber.picture_search(stashes.get('last_image_library'), button.label, _this.controller.get('model.user_name'), true).then(function(data) {
          button = _this.find_button(id);
          var image = data[0];
          if(image && button && button.label && !button.image) {
            var license = {
              type: image.license,
              copyright_notice_url: image.license_url,
              source_url: image.source_url,
              author_name: image.author,
              author_url: image.author_url,
              uneditable: true
            };
            var preview = {
              url: persistence.normalize_url(image.image_url),
              content_type: image.content_type,
              suggestion: button.label,
              protected: image.protected,
              finding_user_name: image.finding_user_name,
              external_id: image.id,
              license: license
            };

            var save = contentGrabbers.pictureGrabber.save_image_preview(preview);

            save.then(function(image) {
              button = _this.find_button(id);
              if(_this.controller.get('model.id') == board_id && button && button.label && !button.image) {
                button.set('pending', false);
                button.set('pending_image', false);
                Ember.set(button, 'image_id', image.id);
                Ember.set(button, 'image', image);
              }
            }, function() {
              button.set('pending', false);
              button.set('pending_image', false);
            });
          } else if(button) {
            button.set('pending', false);
            button.set('pending_image', false);
          }
        }, function() {
          button.set('pending', false);
          button.set('pending_image', false);
          // nothing to do here, this can be a silent failure and it's ok
        });
      }
    });
  },
  lucky_symbol: function(id) {
    if(!this.controller || !app_state.get('edit_mode')) {
      this.lucky_symbol.pendingSymbols = this.lucky_symbol.pendingSymbols || [];
      this.lucky_symbol.pendingSymbols.push(id);
    } else {
      this.lucky_symbols([id]);
    }
  },
  stash_image: function(data) {
    this.stashedImage = data;
  },
  done_editing_image: function() {
    this.imageEditingCallback = null;
  },
  get_edited_image: function() {
    var _this = this;
    return new Ember.RSVP.Promise(function(resolve, reject) {
      if(_this.imageEditorSource) {
        var resolved = false;
        _this.imageEditingCallback = function(data) {
          resolved = true;
          resolve(data);
        };
        Ember.run.later(function() {
          if(!resolved) {
            reject({error: 'editor response timeout'});
          }
        }, 500);
        _this.imageEditorSource.postMessage('imageDataRequest', '*');
      } else {
        reject({editor: 'no editor found'});
      }
    });
  },
  edited_image_received: function(data) {
    if(this.imageEditingCallback) {
      this.imageEditingCallback(data);
    } else if(this.stashedBadge && this.badgeEditingCallback) {
      this.badgeEditingCallback(data);
    }
  },
  copy_board: function(old_board, decision, user, make_public) {
    return new Ember.RSVP.Promise(function(resolve, reject) {
      var ids_to_copy = old_board.get('downstream_board_ids_to_copy') || [];
      var save = old_board.create_copy(user, make_public);
      if(decision == 'remove_links') {
        save = save.then(function(res) {
          res.get('buttons').forEach(function(b) {
            if(Ember.get(b, 'load_board')) {
              Ember.set(b, 'load_board', null);
            }
          });
          return res.save();
        });

      }
      save.then(function(board) {
        board.set('should_reload', true);
        var done_callback = function(result) {
          var affected_board_ids = result && result.affected_board_ids;
          var new_board_ids = result && result.new_board_ids;
          board.set('new_board_ids', new_board_ids);
          if(decision && decision.match(/as_home$/)) {
            user.set('preferences.home_board', {
              id: board.get('id'),
              key: board.get('key')
            });
            user.save().then(function() {
              resolve(board);
            }, function() {
              reject(i18n.t('user_home_failed', "Failed to update user's home board"));
            });
          } else {
            resolve(board);
          }
          stashes.persist('last_index_browse', 'personal');
          old_board.reload_including_all_downstream(affected_board_ids);
        };
        var endpoint = null;
        if(decision == 'modify_links_update' || decision == 'modify_links_copy') {
          if((user.get('stats.board_set_ids') || []).indexOf(old_board.get('id')) >= 0) {
            endpoint = '/api/v1/users/' + user.get('id') + '/replace_board';
          }
        } else if(decision == 'links_copy' || decision == 'links_copy_as_home') {
          endpoint = '/api/v1/users/' + user.get('id') + '/copy_board_links';
        }
        if(endpoint) {
          persistence.ajax(endpoint, {
            type: 'POST',
            data: {
              old_board_id: old_board.get('id'),
              new_board_id: board.get('id'),
              update_inline: (decision == 'modify_links_update'),
              ids_to_copy: ids_to_copy.join(','),
              make_public: make_public
            }
          }).then(function(data) {
            progress_tracker.track(data.progress, function(event) {
              if(event.status == 'finished') {
                user.reload();
                app_state.refresh_session_user();
                done_callback(event.result);
              } else if(event.status == 'errored') {
                reject(i18n.t('re_linking_failed', "Board re-linking failed while processing"));
              }
            });
          }, function() {
            reject(i18n.t('re_linking_failed', "Board re-linking failed unexpectedly"));
          });
        } else {
          done_callback();
        }
      }, function(err) {
        reject(i18n.t('copying_failed', "Board copy failed unexpectedly"));
      });
    });
  },
  retrieve_badge: function() {
    var _this = this;
    return new Ember.RSVP.Promise(function(resolve, reject) {
      var state = null, data_url = null;
      if(_this.badgeEditorSource) {
        var resolved = false;
        _this.badgeEditingCallback = function(data) {
          if(data.match && data.match(/^data:/)) {
            data_url = data;
          }
          if(data && data.zoom) {
            state = data;
          }
          if(state && data_url) {
            _this.badgeEditingCallback.state = state;
            resolved = true;
            resolve(data_url);
          }
        };
        Ember.run.later(function() {
          if(!resolved && data_url) {
            resolve(data_url);
          } else if(!resolved) {
            reject({error: 'editor response timeout'});
          }
        }, 500);
        _this.badgeEditorSource.postMessage('imageDataRequest', '*');
        _this.badgeEditorSource.postMessage('imageStateRequest', '*');
      } else {
        reject({editor: 'no editor found'});
      }
    });
  },
  fetch_suggestions: function(title, ordered_buttons) {
    var num_suggestions = 20;
    console.log("fetch_suggestions function");

    // Extract the words from buttons
    var existing_words = [];
    if (ordered_buttons) {
      ordered_buttons.forEach(function(row) {
        row.forEach(function(btn) {
          if (btn && btn.label) {
            existing_words.push(btn.label);
          }
        });
      });
    }
    console.log("TITLE being passed: " + title);
    console.log("WORDS being passed: " + existing_words);
    
    // Call DataMuse API
    var datamuse_url = 'https://api.datamuse.com/words?ml=' + existing_words.join(',') + '&topics=' + title.split(' ').join(',') + '&md=f&max=20';
    console.log('calling datamuse with url ' + datamuse_url);
    var xmlhttp = new XMLHttpRequest();
    var controller = this.controller;
    var _this = this;
    xmlhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        var results = JSON.parse(this.responseText);
        console.log("results");
        console.log(results);
        var suggested_words = [];
        
        // Keep track of a set of "stems" so that we avoid suggesting
        // duplicate words. For example, "walk", "walks", and "walking"
        // share a common stem ("walk"), so if one is on the board,
        // the other should not be suggested. (This is questionable -
        // many CoughDrop users do want to create words with the same stem,
        // but in those cases the creator problably wants the conjugations
        // organized in some way, which can be done manually.)
        var stems = new Set();
        for (let existing_word of existing_words) {
          stems.add(stemmer(existing_word));
        }
        for (var i = 0; i < results.length; i++) {
          var stem = stemmer(results[i].word);
          if (!stems.has(stem)) {
            var frequency = results[i].tags.find(function(element) {
              return element.startsWith("f:");
            }).substring(2);
            suggested_words.push([results[i].word, results[i].score * Math.log10(frequency)]);
            stems.add(stem);
            console.log("STEM " + stem);
          } else {
            console.log("Duplicate stem! " + stem);
          } 
        } 
        suggested_words.sort(function(a,b) {
          return b[1] - a[1];
        });
        suggested_words = suggested_words.slice(0, num_suggestions);
        console.log("Suggested words: " + suggested_words);
        var buttons = suggested_words.map(function(result){
          return [_this.create_sidebar_button(result[0])];
        });
        console.log('buttons suggested -- ' + buttons);
        controller.set('suggested_buttons', buttons); 
      }
    };
    xmlhttp.open("GET", datamuse_url, true);
    xmlhttp.send();    
  },
  create_sidebar_button: function(word) {
    var _this = this;
    var suggestion_button_id = this.get('suggestion_id');
    this.set('suggestion_id', suggestion_button_id + 1);
    console.log("ID " + suggestion_button_id);
    var sidebar_button = Button.create({
      id: suggestion_button_id,
      label: word,
      background_color: "#fff"
    });
    
    var board_id = _this.controller.get('model.id');

    // Search for an image corresponding to the word
    // (This is mostly copy-pasted from the "lucky_symbols" method)
    if (sidebar_button && sidebar_button.label && !sidebar_button.image && !sidebar_button.local_image_url) {
      sidebar_button.set('pending_image', true);
      sidebar_button.set('pending', true);
      if(sidebar_button && sidebar_button.label && !sidebar_button.image) {
        sidebar_button.check_for_parts_of_speech();
      }
      contentGrabbers.pictureGrabber.picture_search(stashes.get('last_image_library'), sidebar_button.label, _this.controller.get('model.user_name'), true).then(function(data) {
        var image = data[0];
        console.log("grabbing image");
        if(image && sidebar_button && sidebar_button.label && !sidebar_button.image) {
          var license = {
            type: image.license,
            copyright_notice_url: image.license_url,
            source_url: image.source_url,
            author_name: image.author,
            author_url: image.author_url,
            uneditable: true
          };
          var preview = {
            url: persistence.normalize_url(image.image_url),
            content_type: image.content_type,
            suggestion: sidebar_button.label,
            protected: image.protected,
            protected_source: image.protected_source,
            finding_user_name: image.finding_user_name,
            external_id: image.id,
            license: license
          };
          console.log("about to save");
          sidebar_button.set('local_image_url', preview.url);
          sidebar_button.set('pending', false);
          sidebar_button.set('pending_image', true);
          /*Note: we do not actually need to save the sidebar buttons
          var save = contentGrabbers.pictureGrabber.save_image_preview(preview);
          console.log("yoooo");
          save.then(function(image) {
            console.log("saved! :)");
            if (_this.controller.get('model.id') == board_id && sidebar_button && sidebar_button.label && !sidebar_button.image) {
              sidebar_button.set('pending', false);
              sidebar_button.set('pending_image', false);
              emberSet(sidebar_button, 'image_id', image.id);
              emberSet(sidebar_button, 'image', image);
            }
          }, function() {
            sidebar_button.set('pending', false);
            sidebar_button.set('pending_image', false);
          });*/
        } else if(sidebar_button) {
          sidebar_button.set('pending', false);
          sidebar_button.set('pending_image', false);
        }
      }, function() {
        sidebar_button.set('pending', false);
        sidebar_button.set('pending_image', false);
        // nothing to do here, this can be a silent failure and it's ok
      });
    }
    console.log("returning!!");
    console.log(sidebar_button);
    return sidebar_button;
  }
}).create({
  history: [],
  future: [],
  lastChange: {},
  board: null
});

Ember.$(window).bind('message', function(event) {
  event = event.originalEvent;
  if(event.data && event.data.match && event.data.match(/^data:image/)) {
    editManager.edited_image_received(event.data);
  } else if(event.data && event.data.match && event.data.match(/state:{/)) {
    var str = event.data.replace(/^state:/, '');
    try {
      var json = JSON.parse(str);
      if(editManager.stashedBadge && editManager.badgeEditingCallback) {
        editManager.badgeEditingCallback(json);
      }
    } catch(e) { }
  } else if(event.data == 'imageDataRequest' && editManager.stashedImage) {
    editManager.imageEditorSource = event.source;
    event.source.postMessage(editManager.stashedImage.url, '*');
  } else if(event.data == 'wordStateRequest' && editManager.stashedImage) {
    editManager.imageEditorSource = event.source;
    event.source.postMessage("state:" + JSON.stringify(editManager.stashedImage), '*');
  } else if(event.data == 'imageURLRequest' && editManager.stashedBadge) {
    editManager.badgeEditorSource = event.source;
    if(editManager.stashedBadge && editManager.stashedBadge.image_url) {
      event.source.postMessage('https://s3.amazonaws.com/opensymbols/libraries/mulberry/bright.svg', '*');
    }
  } else if(event.data == 'imageStateRequest' && editManager.stashedBadge) {
    editManager.badgeEditorSource = event.source;
    if(editManager.stashedBadge && editManager.stashedBadge.state) {
      event.source.postMessage('state:' + JSON.stringify(editManager.stashedBadge.state));
    }
  }
});
window.editManager = editManager;
export default editManager;
