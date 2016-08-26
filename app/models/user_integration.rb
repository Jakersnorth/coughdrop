class UserIntegration < ActiveRecord::Base
  include Processable
  include Permissions
  include Async
  include GlobalId
  include SecureSerialize
  include Notifiable

  belongs_to :user
  belongs_to :device
  before_save :generate_defaults
  after_save :assert_device
  after_save :assert_webhooks
  after_destroy :disable_device
  after_destroy :delete_webhooks
  has_paper_trail :only => [:settings]
  secure_serialize :settings
  
  add_permissions('view', ['read_profile']) {|user| self.user_id == user.id }
  add_permissions('view', 'edit', 'delete') {|user| self.user_id == user.id }
  add_permissions('view', ['read_profile']) {|user| self.user && self.user.allows?(user, 'edit') }
  add_permissions('view', 'edit', 'delete') {|user| self.user && self.user.allows?(user, 'edit') }
  cache_permissions
  
  def generate_defaults
    self.settings ||= {}
    self.settings['token'] ||= self.class.security_token
    self.settings['static_token'] ||= self.class.security_token
    self.settings['permission_scopes'] ||= ['read_profile']
    self.for_button = !!self.settings['button_webhook_url']
    self.assert_device
    # TODO: assert device
  end
  
  def self.security_token
    Security.sha512('user integration security token', Security.nonce('integration_nonce'))
  end
  
  def assert_device
    if !self.device
      self.device = Device.create(:user => user)
    end
    if self.device && self.device.id && self.id
      self.device.user_integration_id = self.id
      self.device.settings['name'] = self.settings['name']
      self.device.settings['permission_scopes'] = self.settings['permission_scopes']
      self.device.save
    end
    if self.user
      self.user.settings['has_user_integrations'] = true
      self.user.save
    end
  end
  
  def assert_webhooks(frd=false)
    if @install_default_webhooks && !frd
      schedule(:assert_webhooks, true)
    elsif frd
      if for_button && self.settings['button_webhook_url']
        hook = nil
        if self.settings['button_webhook_id']
          hook = Webhook.find_by_path(self.settings['button_webhook_id'])
        else
          hook = Webhook.create(:user_integration_id => self.id)
          self.settings['button_webhook_id'] = hook.global_id
          self.save
        end
        if hook
          hook.settings['name'] = self.settings['name']
          hook.settings['notifications'] = {
            'button_action' => [{
              'callback' => self.settings['button_webhook_url'],
              'include_content' => true,
              'content_type' => 'button'
            }]
          }
          hook.record_code = self.record_code
          hook.user_id = self.user_id
          hook.save
        end
      end
      # install default webhooks
    end
    @install_default_webhooks = false
  end
  
  def process_params(params, non_user_params)
    raise "user required" unless self.user || non_user_params['user']
    self.user = non_user_params['user']

    self.settings ||= {}
    self.settings['name'] = params['name'] if params['name']
    self.settings['custom_integration'] = params['custom_integration'] if params['custom_integration'] != nil
    self.settings['button_webhook_url'] = params['button_webhook_url'] if params['button_webhook_url']
    # list of known types, probably need a background job here to confirm any
    # credentials that are provided
    @install_default_webhooks = true
    if params['regenerate_token']
      self.settings['token'] = self.class.security_token
    end
  end
  
  def delete_webhooks
    Webhook.where(:user_integration_id => self.id).each{|h| h.destroy }
    true
  end
  
  def disable_device
    d = self.device
    if d
      d.settings['disabled'] = true
      d.save
    end
    true
  end
  
  def allow_private_information?
    false
  end
  
  def placement_code(*args)
    raise "needs at least one arg" unless args.length > 0
    raise "strings only" if args.any?{|a| !a.is_a?(String) }
    args << self.settings['static_token']
    Security.sha512(args.join(","), 'user integration placement code')
  end
end