'use strict';

/**
 * passwordless.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

const _ = require("lodash");
const crypto = require("crypto");

const { getAbsoluteServerUrl } = require('strapi-utils');

module.exports = {

  settings() {
    const pluginStore = strapi.store({
      environment: '',
      type: 'plugin',
      name: 'passwordless',
    });
    return pluginStore.get({ key: 'settings' });
  },

  async isEnabled() {
    const settings = await this.settings();
    return !!settings.enabled;
  },

  async user(email, lvl, clickID, tariff, contentVisibility, period) {
    const settings = await this.settings();
    const { user: userService } = strapi.plugins['users-permissions'].services;
    const user = await userService.fetch({ email });
    const level = lvl;
    let start = new Date();
    let end = new Date();



    if (!user && settings.createUserIfNotExists) {

      const role = await strapi
        .query('role', 'users-permissions')
        .findOne({ id: 1 }, []);

      if (!role) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.role.notFound',
            message: 'Impossible to find the default role.',
          })
        );
      }

      if (period != null) {
        end.setDate(end.getDate() + period);

      } else {
        end.setMonth(start.getMonth() + 1);

      }



      return strapi.query('user', 'users-permissions').create({
        email,
        username: email,
        lvl: level,
        clickID: clickID,
        role: { id: role.id },
        tariff: tariff,
        contentVisibility: contentVisibility,
        subscription_start: start.toISOString(),
        subscription_end: end.toISOString(),
        subscritption_start: start.toISOString(),
        subscritption_end: end.toISOString()
      });
    }
    return await strapi.query('user', 'users-permissions')
      .update(
        { email: email },
        {
          lvl: level,
          tariff: tariff,
          contentVisibility: contentVisibility,
          clickID: clickID
        });

  },

  async setIqValues(email, lvl, id) {
    /* const settings = await, this.settings();
    const {user: userService} = strapi.plugins['users-permissions'].services;
    const user = await userService.fetch({email});
    const level = lvl;
    let start = new Date();
    let end = new Date(); */
    var KW = 0;

    switch (lvl) {
      case "Q01":
        KW = 0;
        break;
      case "Q02":
        KW = 0.05;
        break;
      case "Q03":
        KW = 0.25;
        break;
      case "Q04":
        KW = 0.45;
        break;
      case "Q05":
        KW = 0.65;
        break;
      case "Q06":
        KW = 0.85;
        break;
      case "Q07":
        KW = 0.95;
        break;
      case "Q08":
        KW = 1;
        break;
    }
    const result = await strapi
      .query('iq-value-pre-land')
      .create({
        user: id,
        all: Math.round(29 * KW + 27),
        attention: Math.round(24 * KW + 21),
        thinking: Math.round(24 * KW + 35),
        memory: Math.round(37 * KW + 32),
        perception: Math.round(14 * KW + 38),
      })
    return result;




  },

  async updateUser(email, lvl, tariff, contentVisibility) {
    const settings = await this.settings();
    const { user: userService } = strapi.plugins['users-permissions'].services;
    const user = await userService.fetch({ email });
    const level = lvl;
    let start = new Date();


    if (!user /* && settings.createUserIfNotExists */) {

      /* const role = await strapi
        .query('role', 'users-permissions')
        .findOne({ type: settings.default_role }, []);

      if (!role) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.role.notFound',
            message: 'Impossible to find the default role.',
          })
        );
      } */

      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.user.notFound',
          message: 'User is not registered',
        })
      );
    } else {
      return await strapi.query('user', 'users-permissions').update({
        email
      }, {
        username: email
      },
        { lvl: level },
        //{role: {id: role.id}},
        { tariff: tariff },
        { contentVisibility: contentVisibility },
        { subscription_start: start.toISOString() },
      );
    }
  },

  async sendLoginLink(token, htmlMessage, lvl, subjectText, site) {
    const settings = await this.settings();
    const level = lvl;

    const text = await this.template(htmlMessage, {
      URL: `${getAbsoluteServerUrl(strapi.config)}/passwordless/login`,
      CODE: token.body,
      LVL: level,
      SITE: site,
    });
    const html = await this.template(htmlMessage, {
      URL: `${getAbsoluteServerUrl(strapi.config)}/passwordless/login`,
      CODE: token.body,
      LVL: level,
      SITE: site,
    });

    // Send an email to the user.
    return strapi.plugins['email'].services.email.send({
      to: token.email,
      from:
        settings.from_email && settings.from_name
          ? `${settings.from_name} <${settings.from_email}>`
          : undefined,
      replyTo: settings.response_email,
      subject: subjectText,
      text,
      html,
    });
  },

  async createToken(email) {
    const tokensService = strapi.query('tokens', 'passwordless');
    const oldTokens = await tokensService.find({ email });
    await Promise.all(oldTokens.map((token) => {
      return tokensService.update({ id: token.id }, { is_active: false });
    }));
    const body = crypto.randomBytes(20).toString('hex');
    const tokenInfo = {
      email,
      body,
      create_date: new Date()
    };
    return tokensService.create(tokenInfo);
  },

  updateTokenOnLogin(token) {
    const tokensService = strapi.query('tokens', 'passwordless');
    return tokensService.update({ id: token.id }, { is_active: false, login_date: new Date() });
  },

  async isTokenValid(token) {
    if (!token || !token.is_active) {
      return false;
    }
    const settings = await this.settings();
    const tokensService = strapi.query('tokens', 'passwordless');

    const tokenDate = new Date(token.created_at).getTime() / 1000;
    const nowDate = new Date().getTime() / 1000;

    const isValidDate = nowDate - tokenDate <= settings.expire_period;
    if (!isValidDate) {
      await tokensService.update({ id: token.id }, { is_active: false });
    }
    return isValidDate;
  },

  fetchToken(body) {
    const tokensService = strapi.query('tokens', 'passwordless');
    return tokensService.findOne({ body });
  },

  template(layout, data) {
    const compiledObject = _.template(layout);
    return compiledObject(data);
  },
};
