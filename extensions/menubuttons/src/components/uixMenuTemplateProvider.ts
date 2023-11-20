/**
 * See the LICENSE file distributed with this work for additional
 * information regarding copyright ownership.
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 *
 * This file is part of the Cristal Wiki software prototype
 * @copyright  Copyright (c) 2023 XWiki SAS
 * @license    http://opensource.org/licenses/AGPL-3.0 AGPL-3.0
 *
 **/

import { DefaultUIXTemplateProvider } from "@cristal/skin";
import Menu from "./c-menu.vue";
import { injectable } from "inversify";
import "reflect-metadata";
import type { Component } from "vue";

@injectable()
export class UIXMenuTemplateProvider extends DefaultUIXTemplateProvider {
  public static cname = "cristal.vuejs.component";
  public static hint = "menu";
  public static priority = 1000;
  public static singleton = true;
  public static extensionPoint = "sidebar.before";

  constructor() {
    super();
  }

  getVueComponent(): Component {
    return Menu;
  }

  getMenuItems(): Array<string> {
    const menus: Array<string> = [];
    return menus;
  }

  getVueName(): string {
    return "Menu";
  }

  isGlobal(): boolean {
    return false;
  }
}
