/**
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
import { assertUnreachable, tryFallibleOrError } from "@xwiki/cristal-fn-utils";
import { macrosAstToHtmlConverterName } from "@xwiki/cristal-macros-ast-html-converter";
import { macrosServiceName } from "@xwiki/cristal-macros-service";
import { inject, injectable } from "inversify";
import type { UniAstToHTMLConverter } from "./uni-ast-to-html-converter";
import type { MacrosAstToHtmlConverter } from "@xwiki/cristal-macros-ast-html-converter";
import type { MacrosService } from "@xwiki/cristal-macros-service";
import type { EntityReference } from "@xwiki/cristal-model-api";
import type { ModelReferenceParserProvider } from "@xwiki/cristal-model-reference-api";
import type { RemoteURLSerializerProvider } from "@xwiki/cristal-model-remote-url-api";
import type {
  Block,
  BlockStyles,
  Image,
  InlineContent,
  LinkTarget,
  UniAst,
} from "@xwiki/cristal-uniast-api";

@injectable()
export class DefaultUniAstToHTMLConverter implements UniAstToHTMLConverter {
  /**
   * XML serializer for fast HTML escaping
   */
  private readonly xmlSerializer = new XMLSerializer();

  constructor(
    @inject("RemoteURLSerializerProvider")
    private readonly remoteURLSerializerProvider: RemoteURLSerializerProvider,

    @inject("ModelReferenceParserProvider")
    private readonly modelReferenceParserProvider: ModelReferenceParserProvider,

    @inject(macrosServiceName)
    private readonly macrosService: MacrosService,

    @inject(macrosAstToHtmlConverterName)
    private readonly macrosAstToHtmlConverter: MacrosAstToHtmlConverter,
  ) {}

  toHtml(ast: UniAst): string | Error {
    return tryFallibleOrError(() => this.convertBlocks(ast.blocks));
  }

  private convertBlocks(blocks: Block[]): string {
    return blocks.map((block) => this.convertBlock(block)).join("");
  }

  private convertInlineContents(inlineContents: InlineContent[]): string {
    return inlineContents
      .map((inlineContent) => this.convertInlineContent(inlineContent))
      .join("");
  }

  // eslint-disable-next-line max-statements
  private convertBlock(block: Block): string {
    switch (block.type) {
      case "paragraph":
        return this.produceBlockHtml(
          "p",
          block.styles,
          this.convertInlineContents(block.content),
        );

      case "heading":
        return this.produceBlockHtml(
          `h${block.level}`,
          block.styles,
          this.convertInlineContents(block.content),
        );

      case "list":
        return this.produceBlockHtml(
          block.items.length > 0 && block.items[0].number !== undefined
            ? "ol"
            : "ul",
          block.styles,
          block.items
            .map((item) =>
              this.produceHtmlEl(
                "li",
                {},
                `${item.checked !== undefined ? `<input type="checkbox" checked="${item.checked.toString()}" readOnly />` : ""}${this.convertBlocks(item.content)}`,
              ),
            )
            .join(""),
        );

      case "quote":
        return this.produceBlockHtml(
          "blockquote",
          block.styles,
          this.convertBlocks(block.content),
        );

      case "code":
        // TODO: syntax highlighting?
        return this.produceBlockHtml("pre", {}, this.escapeHtml(block.content));

      case "table": {
        const colgroup = this.produceHtmlEl(
          "colgroup",
          {},
          block.columns
            .map((col) =>
              this.produceHtmlEl(
                "col",
                {
                  width: col.widthPx ? `${col.widthPx}px` : "",
                },
                false,
              ),
            )
            .join(""),
        );

        const thead = block.columns.find((col) => col.headerCell)
          ? this.produceHtmlEl(
              "thead",
              {},
              block.columns
                .map((col) =>
                  col.headerCell
                    ? this.produceBlockHtml(
                        "th",
                        col.headerCell.styles,
                        this.convertInlineContents(col.headerCell.content),
                      )
                    : "",
                )
                .join(""),
            )
          : "";

        const tbody = block.rows.map((row) =>
          this.produceHtmlEl(
            "tr",
            {},
            [
              row.map((cell) =>
                this.produceBlockHtml(
                  "td",
                  cell.styles,
                  this.convertInlineContents(cell.content),
                  {
                    colspan: cell.colSpan?.toString(),
                    rowspan: cell.rowSpan?.toString(),
                  },
                ),
              ),
            ].join(""),
          ),
        );

        return this.produceBlockHtml(
          "table",
          block.styles,
          [colgroup, thead, tbody].join(""),
        );
      }

      case "image":
        return this.convertImage(block);

      case "break":
        return "<hr>";

      case "macroBlock": {
        const macro = this.macrosService.get(block.name);

        if (!macro) {
          // TODO: proper error reporting
          // Tracking issue: https://jira.xwiki.org/browse/CRISTAL-725
          return `<strong>Macro "${block.name}" was not found</strong>`;
        }

        if (macro.renderAs === "inline") {
          // TODO: proper error reporting
          // Tracking issue: https://jira.xwiki.org/browse/CRISTAL-725
          return `<strong>Macro "${block.name}" is of type "inline", but used here as a block</strong>`;
        }

        const rendered = this.macrosAstToHtmlConverter.blocksToHTML(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          macro.render(block.params as any),
        );

        if (rendered instanceof Error) {
          throw rendered;
        }

        return rendered;
      }

      default:
        assertUnreachable(block);
    }
  }

  private convertImage(image: Image): string {
    return this.produceHtmlEl(
      "img",
      {
        src: this.getTargetUrl(image.target),
        alt: image.alt,
        width: image.widthPx ? `${image.widthPx}px` : undefined,
        height: image.heightPx ? `${image.heightPx}px` : undefined,
      },
      false,
    );
  }

  // eslint-disable-next-line max-statements
  private convertInlineContent(inlineContent: InlineContent): string {
    switch (inlineContent.type) {
      case "text": {
        const { content, styles } = inlineContent;

        const { bold, italic, strikethrough, code } = styles;

        const surroundings = [];

        if (bold) {
          surroundings.push("strong");
        }

        if (italic) {
          surroundings.push("em");
        }

        if (strikethrough) {
          surroundings.push("s");
        }

        // Code must be last as it's going to be the most outer surrounding
        // Otherwise other surroundings would be "trapped" inside the inline code content
        if (code) {
          surroundings.push("pre");
        }

        let html = this.escapeHtml(content);

        if (surroundings.length === 0) {
          return `<span>${this.escapeHtml(html)}</span>`;
        }

        for (const surrounding of surroundings) {
          html = this.produceHtmlEl(surrounding, {}, html);
        }

        return html;
      }

      case "link":
        return this.produceHtmlEl(
          "a",
          { href: this.getTargetUrl(inlineContent.target) },
          this.convertInlineContents(inlineContent.content),
        );

      case "image":
        return this.convertImage(inlineContent);

      case "inlineMacro": {
        const macro = this.macrosService.get(inlineContent.name);

        if (!macro) {
          // TODO: proper error reporting
          // Tracking issue: https://jira.xwiki.org/browse/CRISTAL-725
          return `<strong>Macro "${inlineContent.name}" was not found</strong>`;
        }

        if (macro.renderAs === "block") {
          // TODO: proper error reporting
          // Tracking issue: https://jira.xwiki.org/browse/CRISTAL-725
          return `<strong>Macro "${inlineContent.name}" is of type "block", but used here as inline</strong>`;
        }

        const rendered = this.macrosAstToHtmlConverter.inlineContentsToHTML(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          macro.render(inlineContent.params as any),
        );

        if (rendered instanceof Error) {
          throw rendered;
        }

        return rendered;
      }

      default:
        assertUnreachable(inlineContent);
    }
  }

  private getTargetUrl(target: LinkTarget): string {
    if (target.type === "external") {
      return target.url;
    }

    if (target.parsedReference) {
      return this.serializeReference(target.parsedReference)!;
    }

    const ref = this.modelReferenceParserProvider
      .get()!
      .parse(target.rawReference);

    return this.serializeReference(ref)!;
  }

  private serializeReference(ref: EntityReference): string {
    const url = this.remoteURLSerializerProvider.get()!.serialize(ref);

    // TODO: find when this could happen
    if (!url) {
      throw new Error(`Failed to serialize entity reference: "${url}"`);
    }

    return url;
  }

  private produceBlockHtml(
    tagName: string,
    styles: BlockStyles,
    innerHTML: string,
    attrs?: Record<string, string | undefined>,
  ): string {
    let cssRules = "";

    if (styles.backgroundColor) {
      cssRules += `background-color: ${styles.backgroundColor};`;
    }

    if (styles.textColor) {
      cssRules += `color: ${styles.textColor};`;
    }

    if (styles.textAlignment) {
      cssRules += `text-align: ${styles.textAlignment};`;
    }

    return this.produceHtmlEl(
      tagName,
      {
        ...attrs,
        style: cssRules !== "" ? cssRules.trim() : undefined,
      },
      innerHTML,
    );
  }

  private produceHtmlEl(
    tagName: string,
    attrs: Record<string, string | undefined>,
    innerHTML: string | false,
  ): string {
    const el = document.createElement(tagName);

    for (const [name, value] of Object.entries(attrs)) {
      if (value !== undefined) {
        el.setAttribute(name, value);
      }
    }

    if (innerHTML !== false) {
      el.innerHTML = innerHTML;
    }

    return el.outerHTML;
  }

  private escapeHtml(content: string) {
    return this.xmlSerializer.serializeToString(
      document.createTextNode(content),
    );
  }
}
