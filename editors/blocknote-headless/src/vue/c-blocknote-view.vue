<!--
See the LICENSE file distributed with this work for additional
information regarding copyright ownership.

This is free software; you can redistribute it and/or modify it
under the terms of the GNU Lesser General Public License as
published by the Free Software Foundation; either version 2.1 of
the License, or (at your option) any later version.

This software is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this software; if not, write to the Free
Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
02110-1301 USA, or see the FSF site: http://www.fsf.org.
-->
<script setup lang="ts">
import { computeCurrentUser } from "../components/currentUser";
import { createLinkEditionContext } from "../components/linkEditionContext";
import messages from "../translations";
import { BlockNoteToUniAstConverter } from "../uniast/bn-to-uniast";
import { UniAstToBlockNoteConverter } from "../uniast/uniast-to-bn";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  DocumentService,
  name as documentServiceName,
} from "@xwiki/cristal-document-api";
import {
  BlockNoteViewWrapperProps,
  EditorType,
  mountBlockNote,
} from "@xwiki/cristal-editors-blocknote-react";
import { UniAst, createConverterContext } from "@xwiki/cristal-uniast";
import { Container } from "inversify";

import { debounce } from "lodash-es";
import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import type { AuthenticationManagerProvider } from "@xwiki/cristal-authentication-api";

const {
  editorProps,
  editorContent: uniAst,
  realtimeServerURL = undefined,
  container,
} = defineProps<{
  editorProps: Omit<BlockNoteViewWrapperProps, "content" | "linkEditionCtx">;
  editorContent: UniAst | Error;
  realtimeServerURL?: string | undefined;
  container: Container;
}>();

const editorRef = shallowRef<EditorType | null>(null);
const providerRef = shallowRef<HocuspocusProvider | null>(null);

const emit = defineEmits<{
  // Emitted as soon as a user-triggered change happens into the editor
  // The event won't be triggered when the editor is filled with its initial content,
  // or when the editor's content changes due to modifications made by other players in the realtime session
  "instant-change": [];

  // Emitted in the same context as "instant-change", but debounced
  "debounced-change": [content: UniAst];

  // Emitted when the realtime provider is set up in the editor
  "setup-provider": [provider: HocuspocusProvider];
}>();

defineExpose({
  // Get the editor's content
  getContent: (): UniAst | Error => extractEditorContent(),
});

/**
 * Extract the editor's content and convert it to UniAst
 */
function extractEditorContent(): UniAst | Error {
  return blockNoteToUniAst.blocksToUniAst(editorRef.value!.document);
}

/**
 * Notify the parent component the editor's content changed
 */
function notifyChanges(): void {
  const content = extractEditorContent();

  // TODO: error reporting
  if (content instanceof Error) {
    throw content;
  }

  emit("debounced-change", content);
}

const notifyChangesDebounced = debounce(notifyChanges, 500);

/**
 * This function's purpose is to build the realtime provider that will be used throughout the app
 */
async function getRealtimeOptions(): Promise<
  BlockNoteViewWrapperProps["realtime"]
> {
  const documentService = container.get<DocumentService>(documentServiceName);
  const authenticationManager = container
    .get<AuthenticationManagerProvider>("AuthenticationManagerProvider")
    .get()!;

  if (!realtimeServerURL) {
    return undefined;
  }

  const documentReference =
    documentService.getCurrentDocumentReferenceString().value;

  if (!documentReference) {
    throw new Error("Got no document reference!");
  }

  const user = await computeCurrentUser(authenticationManager);

  return {
    hocusPocus: {
      url: realtimeServerURL,
      // we distinguish from sessions from other editors with a ':blocknote' suffix.
      name: `${documentReference}:blocknote`,
    },
    user,
  };
}

const { t } = useI18n({
  messages,
});

// Build the properties object for the React BlockNoteView component
const initializedEditorProps: Omit<BlockNoteViewWrapperProps, "content"> = {
  ...editorProps,
  onChange: () => {
    emit("instant-change");
    notifyChangesDebounced();
  },
  blockNoteOptions: editorProps.blockNoteOptions,
  linkEditionCtx: createLinkEditionContext(container),
  realtime: await getRealtimeOptions(),
  refs: {
    setEditor(editor) {
      editorRef.value = editor;
    },
    setProvider(provider) {
      providerRef.value = provider;
    },
  },
};

const converterContext = createConverterContext(container);

const blockNoteToUniAst = new BlockNoteToUniAstConverter(converterContext);

const uniAstToBlockNote = new UniAstToBlockNoteConverter(converterContext);

const content =
  uniAst instanceof Error
    ? uniAst
    : uniAstToBlockNote.uniAstToBlockNote(uniAst);

watch(providerRef, (provider) => provider && emit("setup-provider", provider));

const blockNoteContainer = useTemplateRef<HTMLElement>("blocknote-container");

const mountedBlockNote = ref<{ unmount: () => void }>();

onMounted(() => {
  if (content instanceof Error) {
    throw content;
  }

  if (!blockNoteContainer.value) {
    throw new Error("Missing DOM container for BlockNote!");
  }

  mountedBlockNote.value = mountBlockNote(blockNoteContainer.value, {
    ...initializedEditorProps,
    content,
  });
});

onBeforeUnmount(() => {
  if (!mountedBlockNote.value) {
    throw new Error("BlockNote mounted data are absent");
  }

  mountedBlockNote.value.unmount();
});
</script>

<template>
  <h1 v-if="content instanceof Error">
    {{ t("blocknote.document.parsingError", { reason: content }) }}
  </h1>

  <div ref="blocknote-container" />
</template>

<style scoped>
.shadow {
  box-shadow: 0px 4px 12px #cfcfcf;
  border-radius: 6px;
  padding: 2px;
}

:deep(.bn-editor) {
  font-family: var(--cr-font-sans);
  font-size: var(--cr-base-font-size);
  font-weight: var(--cr-font-weight-normal);
  color: var(--cr-base-text-color);
  letter-spacing: var(--cr-letter-spacing-normal);
  line-height: var(--cr-line-height-normal);
  padding-inline-start: var(--cr-spacing-large);

  /* Note: font sizes are inconsistent here, but that's how they are rendered at the end. So we keep it the same here. */
  & h1 {
    font-size: var(--cr-font-size-x-large);
  }

  & h2 {
    font-size: var(--cr-font-size-x-large);
  }

  & h3 {
    font-size: var(--cr-font-size-large);
  }

  & h4 {
    font-size: var(--cr-font-size-medium);
  }

  & h5 {
    font-size: var(--cr-font-size-medium);
  }

  & h6 {
    font-size: var(--cr-font-size-medium);
  }

  /* Remove left border on lists */
  & .bn-block-group,
  .bn-block-group .bn-block-outer:not([data-prev-depth-changed])::before {
    border-left: none;
  }

  & [data-content-type="bulletListItem"] {
    padding-inline-start: var(--cr-spacing-large);
  }

  & blockquote {
    background-color: var(--cr-color-neutral-50);
    color: var(--cr-color-neutral-600);
    font-size: var(--cr-font-size-large);
    border-inline-start: 2px solid var(--cr-color-neutral-200);
    padding-inline-start: var(--cr-spacing-large);
    margin: 0;
  }

  & [data-content-type="codeBlock"] {
    background: white;
    border-radius: var(--cr-border-radius-medium);
    font-family: var(--cr-font-mono);
    color: var(--cr-base-text-color);

    & pre {
      margin: 0;
      padding: 0;
    }
  }
}
</style>
