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
  AttachmentReference,
  DocumentReference,
  EntityReference,
  SpaceReference,
} from "@xwiki/cristal-model-api";
import { ModelReferenceParser } from "@xwiki/cristal-model-reference-api";
import { injectable } from "inversify";

@injectable()
export class NextcloudModelReferenceParser implements ModelReferenceParser {
  parse(reference: string): EntityReference {
    if (/^https?:\/\//.test(reference)) {
      throw new Error(`[${reference}] is not a valid entity reference`);
    }
    let segments = reference.split("/");
    if (segments[0] == "") {
      segments = segments.slice(1);
    }
    if (segments[segments.length - 2] == "attachments") {
      return new AttachmentReference(
        segments[segments.length - 1],
        new DocumentReference(
          segments[segments.length - 3],
          new SpaceReference(
            undefined,
            ...segments.slice(0, segments.length - 3),
          ),
        ),
      );
    } else {
      return new DocumentReference(
        segments[segments.length - 1],
        new SpaceReference(
          undefined,
          ...segments.slice(0, segments.length - 1),
        ),
      );
    }
  }
}
