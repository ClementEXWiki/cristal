/*
 * See the LICENSE file distributed with this work for additional
 * information regarding copyright ownership.
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

import {
  AttachmentsData,
  DefaultPageData,
  PageAttachment,
  PageData,
} from "@xwiki/cristal-api";
import { AbstractStorage } from "@xwiki/cristal-backend-api";
import { XMLParser } from "fast-xml-parser";
import { inject, injectable } from "inversify";
import type { AlertsServiceProvider } from "@xwiki/cristal-alerts-api";
import type { Logger } from "@xwiki/cristal-api";
import type {
  AuthenticationManagerProvider,
  UserDetails,
} from "@xwiki/cristal-authentication-api";

/**
 * Access Nextcloud storage through http.
 * Read and write files to a ~/.cristal directory where all persistent data is
 * stored.
 *
 * @since 0.9
 */
@injectable()
export class NextcloudStorage extends AbstractStorage {
  private readonly ATTACHMENTS = "attachments";
  private initBaseContentCalled: boolean = false;

  constructor(
    @inject("Logger") logger: Logger,
    @inject("AuthenticationManagerProvider")
    private authenticationManagerProvider: AuthenticationManagerProvider,
    @inject("AlertsServiceProvider")
    private readonly alertsServiceProvider: AlertsServiceProvider,
  ) {
    super(logger, "storage.components.nextcloudStorage");
  }

  async getEditField(): Promise<string> {
    // TODO: unsupported
    return "";
  }

  getImageURL(): string {
    // TODO: unsupported
    return "";
  }

  // eslint-disable-next-line max-statements
  async getPageContent(page: string): Promise<PageData | undefined> {
    const username = (
      await this.authenticationManagerProvider.get()?.getUserDetails()
    )?.username;
    if (!username) {
      const pageData = new DefaultPageData();
      // TODO: Fix CRISTAL-383 (Error messages in Storages are not translated)
      pageData.html = "Not logged-in.";
      pageData.canEdit = false;
      return pageData;
    }

    await this.initBaseContent(username!);
    const baseRestURL = this.getWikiConfig().baseRestURL;
    try {
      const response = await fetch(
        `${baseRestURL}/${username}/.cristal/${page}/page.json`,
        {
          method: "GET",
          headers: await this.getCredentials(),
        },
      );

      if (response.status >= 200 && response.status < 300) {
        const { lastModificationDate, lastAuthor } =
          await this.getLastEditDetails(page, username!);

        const json = await response.json();

        // A PageData instance must be returned as toObject is expected to be
        // available to serialize page data. For instance, for the offline
        // storage
        const pageData = new DefaultPageData();
        pageData.fromObject(json);
        pageData.headline = json.name;
        pageData.headlineRaw = json.name;
        pageData.lastAuthor = lastAuthor;
        pageData.lastModificationDate = lastModificationDate;
        pageData.canEdit = true;
        return pageData;
      } else {
        return undefined;
      }
    } catch (e) {
      console.error("Unable to get page content", e);
      return undefined;
    }
  }

  private async getLastEditDetails(
    page: string,
    username: string,
  ): Promise<{ lastModificationDate?: Date; lastAuthor?: UserDetails }> {
    let lastModificationDate: Date | undefined;
    let lastAuthor: UserDetails | undefined;
    const response = await fetch(
      `${this.getWikiConfig().baseRestURL}/${username}/.cristal/${page}/page.json`,
      {
        body: `<?xml version="1.0" encoding="UTF-8"?>
          <d:propfind xmlns:d="DAV:">
            <d:prop xmlns:oc="http://owncloud.org/ns">
              <d:getlastmodified />
              <oc:owner-id />
              <oc:owner-display-name />
            </d:prop>
          </d:propfind>`,
        method: "PROPFIND",
        headers: {
          ...(await this.getCredentials()),
          Accept: "application/json",
        },
      },
    );
    if (response.status >= 200 && response.status < 300) {
      // window.DOMParser can't be used because it is not available in web
      // workers.
      const prop = new XMLParser().parse(await response.text())[
        "d:multistatus"
      ]["d:response"]["d:propstat"]["d:prop"];
      const modified = prop["d:getlastmodified"];
      if (modified) {
        lastModificationDate = new Date(Date.parse(modified));
      }
      lastAuthor = {
        username: prop["oc:owner-id"],
        name: prop["oc:owner-display-name"],
      };
    }

    return { lastModificationDate, lastAuthor };
  }

  // TODO: reduce the number of statements in the following method and reactivate the disabled eslint rule.
  // eslint-disable-next-line max-statements
  async getAttachments(page: string): Promise<AttachmentsData | undefined> {
    const username = (
      await this.authenticationManagerProvider.get()?.getUserDetails()
    )?.username;
    if (!username) {
      return undefined;
    }

    const response = await fetch(this.getAttachmentsBasePath(page, username!), {
      method: "PROPFIND",
      headers: {
        ...(await this.getCredentials()),
        Depth: "1",
        Accept: "application/json",
      },
    });

    if (response.status >= 200 && response.status < 300) {
      const text = await response.text();
      const data = new window.DOMParser().parseFromString(text, "text/xml");

      const responses = data.getElementsByTagName("d:response");
      const attachments: PageAttachment[] = [];
      for (let i = 0; i < responses.length; i++) {
        const dresponse = responses[i];
        if (dresponse.getElementsByTagName("d:getcontenttype").length > 0) {
          attachments.push(this.parseAttachment(dresponse, username!));
        }
      }

      return { attachments };
    } else {
      return undefined;
    }
  }

  async getAttachment(
    page: string,
    name: string,
  ): Promise<PageAttachment | undefined> {
    const username = (
      await this.authenticationManagerProvider.get()?.getUserDetails()
    )?.username;
    if (!username) {
      return undefined;
    }

    const propfindResponse = await fetch(
      this.getAttachmentBasePath(name, page, username!),
      {
        method: "PROPFIND",
        headers: {
          ...(await this.getCredentials()),
          Depth: "1",
          Accept: "application/json",
        },
      },
    );

    if (propfindResponse.status >= 200 && propfindResponse.status < 300) {
      const text = await propfindResponse.text();
      const data = new window.DOMParser().parseFromString(text, "text/xml");
      const response = data.getElementsByTagName("d:response")[0];
      return this.parseAttachment(response, username!);
    } else {
      return undefined;
    }
  }

  private getAttachmentsBasePath(page: string, username: string) {
    return `${this.getWikiConfig().baseRestURL}/${username}/.cristal/${page}/${this.ATTACHMENTS}`;
  }

  private getAttachmentBasePath(name: string, page: string, username: string) {
    return `${this.getAttachmentsBasePath(page, username)}/${name}`;
  }

  async save(page: string, content: string, title: string): Promise<unknown> {
    const username = (
      await this.authenticationManagerProvider.get()?.getUserDetails()
    )?.username;
    if (!username) {
      return;
    }

    // Splits the page reference along the / and create intermediate directories
    // for each segment, expect the last one where the content and title are
    // persisted.
    const directories = page.split("/");

    // Create the root directory. We also need to create all intermediate directories.
    const rootURL = `${this.getWikiConfig().baseRestURL}/${username}/.cristal`;
    await this.createIntermediateDirectories(rootURL, directories);

    await fetch(`${rootURL}/${directories.join("/")}/page.json`, {
      method: "PUT",
      headers: await this.getCredentials(),
      body: JSON.stringify({
        source: content,
        name: title,
        syntax: "markdown/1.2",
      }),
    });

    return;
  }

  private async createIntermediateDirectories(
    rootURL: string,
    directories: string[],
  ) {
    await this.createDirectory(rootURL);

    for (let i = 0; i < directories.length; i++) {
      // The intermediate directories must exist for the target file to be
      // accepted by webdav.
      await this.createDirectory(
        `${rootURL}/${directories.slice(0, i + 1).join("/")}`,
      );
    }
  }

  async saveAttachments(page: string, files: File[]): Promise<unknown> {
    const username = (
      await this.authenticationManagerProvider.get()?.getUserDetails()
    )?.username;
    if (!username) {
      // TODO: Fix CRISTAL-383 (Error messages in Storages are not translated)
      this.alertsServiceProvider
        .get()
        .error(
          `Could not save attachments for page ${page}, the user is not properly logged-in.`,
        );
      return undefined;
    }

    return Promise.all(
      files.map((file) => this.saveAttachment(page, file, username!)),
    );
  }

  private async saveAttachment(
    page: string,
    file: File,
    username: string,
  ): Promise<unknown> {
    const directories = page.split("/");

    // Create the root directory. We also need to create all intermediate directories.
    const rootURL = `${this.getWikiConfig().baseRestURL}/${username}/.cristal`;
    await this.createIntermediateDirectories(rootURL, [
      ...directories,
      this.ATTACHMENTS,
    ]);

    const fileURL =
      this.getAttachmentsBasePath(page, username) + "/" + file.name;
    await fetch(fileURL, {
      method: "PUT",
      headers: await this.getCredentials(),
      body: file,
    });
    return;
  }

  getPageFromViewURL(): string | null {
    return null;
  }

  getPageRestURL(): string {
    return "";
  }

  async getPanelContent(): Promise<PageData> {
    // TODO: unsupported
    return new DefaultPageData();
  }

  async delete(page: string): Promise<{ success: boolean; error?: string }> {
    const username = (
      await this.authenticationManagerProvider.get()?.getUserDetails()
    )?.username;
    if (!username) {
      return { success: false, error: "Not logged-in." };
    }

    const rootURL = `${this.getWikiConfig().baseRestURL}/${username}/.cristal`;
    const success = await fetch(`${rootURL}/${page}`, {
      method: "DELETE",
      headers: await this.getCredentials(),
    }).then(async (response) => {
      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: await response.text() };
      }
    });
    return success;
  }

  async move(): Promise<{ success: boolean; error?: string }> {
    // TODO: to be implemented in CRISTAL-435.
    throw new Error("Move not supported");
  }

  async isStorageReady(): Promise<boolean> {
    return true;
  }

  private async createDirectory(currentTarget: string) {
    await fetch(currentTarget, {
      method: "MKCOL",
      headers: await this.getCredentials(),
    });
  }

  private async getCredentials(): Promise<{ Authorization?: string }> {
    const authorizationHeader = await this.authenticationManagerProvider
      .get()
      ?.getAuthorizationHeader();
    const headers: { Authorization?: string } = {};
    if (authorizationHeader) {
      headers["Authorization"] = authorizationHeader;
    }
    return headers;
  }

  private parseAttachment(element: Element, username: string): PageAttachment {
    const id = element.getElementsByTagName("d:href")[0].textContent!;
    const mimetype =
      element.getElementsByTagName("d:getcontenttype")[0].textContent!;
    const size = parseInt(
      element.getElementsByTagName("d:getcontentlength")[0].textContent!,
    );
    const date = Date.parse(
      element.getElementsByTagName("d:getlastmodified")[0].textContent!,
    );
    const segments = id.split("/");
    const href = `${this.getWikiConfig().baseRestURL}/${username}/${segments.slice(5).join("/")}`;
    const reference = segments[segments.length - 1];

    return {
      mimetype,
      reference,
      id,
      href,
      size,
      date: new Date(date),
      // For now nextcloud does not allow for shared Cristal storage, so all files are owned by the current user
      author: undefined,
    };
  }

  private async initBaseContent(username: string) {
    if (!this.initBaseContentCalled) {
      this.initBaseContentCalled = true;
      const baseRestURL = this.getWikiConfig().baseRestURL;
      const headers = await this.getCredentials();
      try {
        const res = await fetch(`${baseRestURL}/${username}/.cristal`, {
          method: "GET",
          headers: headers,
        });
        // if .cristal does not exist, initialize it with a default content.
        if (res.status === 404) {
          await this.save(
            "home",
            "# Welcome\n" +
              "\n" +
              "This is a new **Cristal** wiki.\n" +
              "\n" +
              "You can use it to take your *own* notes.\n" +
              "\n" +
              "You can also create new [[pages|home/newpage]].\n" +
              "\n" +
              "Enjoy!",
            "",
          );
        }
      } catch (e) {
        console.error("Failed to initialize Cristal default content", e);
      }
    }
  }
}
