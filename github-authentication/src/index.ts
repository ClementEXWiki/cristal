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

import { config } from "./config";
import express from "express";
import type { Request, Response } from "express";

const app = express();

app.get("/device-login", async (_req: Request, res: Response) => {
  const deviceLoginUrl = new URL(config.GITHUB_DEVICE_LOGIN_URL);
  deviceLoginUrl.searchParams.set("client_id", config.GITHUB_APP_CLIENT_ID);

  const deviceLoginResponse = await fetch(deviceLoginUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(await deviceLoginResponse.text());
});

app.get(
  "/device-verify",
  async (
    req: Request<unknown, unknown, unknown, { device_code: string }>,
    res: Response,
  ) => {
    const deviceVerifyUrl = new URL(config.GITHUB_DEVICE_VERIFY_URL);
    deviceVerifyUrl.searchParams.set("client_id", config.GITHUB_APP_CLIENT_ID);
    deviceVerifyUrl.searchParams.set("device_code", req.query.device_code);
    deviceVerifyUrl.searchParams.set(
      "grant_type",
      "urn:ietf:params:oauth:grant-type:device_code",
    );

    const deviceVerifyResponse = await fetch(deviceVerifyUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(await deviceVerifyResponse.text());
  },
);

let port = 15682;
const env_port = parseInt(process.env.GITHUB_AUTH_HTTP_PORT || "");
if (!isNaN(env_port) && env_port > 0) {
  port = env_port;
}

app.listen(port, () => {
  console.log(`Application is running on http://localhost:${port}`);
});
