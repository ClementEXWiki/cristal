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
<script lang="ts" setup>
import "@shoelace-style/shoelace";
</script>
<template>
  <sl-dropdown stay-open-on-select>
    <!-- @vue-expect-error the slot attribute is shoelace specific and is not know by the typechecker.
    Disabling it for now as I did not find an elegant solution to declare this property. -->
    <span slot="trigger">
      <slot name="activator" />
    </span>
    <sl-menu>
      <slot name="default" />
    </sl-menu>
  </sl-dropdown>
</template>
<style scoped>
sl-dropdown {
  z-index: var(--cr-z-index-dropdown);
}
</style>
