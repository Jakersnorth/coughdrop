import Ember from "ember";
import DS from "ember-data";
import persistence from '../utils/persistence';

var res = DS.RESTAdapter.extend({
  namespace: 'api/v1',
  headers: {
  	'Access-Control-Allow-Origin': '*'
  }
}, persistence.DSExtend);

export default res;
