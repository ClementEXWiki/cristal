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
// For now this component is mostly useful to centralize user display use. Several ways to display user or users must be
// provided over time, and more adapted to the design systems.
import { UserDetails } from "@xwiki/cristal-authentication-api";

defineProps<{ user: UserDetails }>();
</script>

<template>
  <a v-if="user.profile" :href="user.profile">
    {{ user.name }}
  </a>
  <span v-else>{{ user.name }}</span>
</template>

<style scoped></style>
