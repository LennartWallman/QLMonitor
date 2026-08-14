<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>👥 Användarhantering</h2>
        <button @click="close">✕</button>
      </div>
 
      <table class="user-table">
        <thead>
          <tr>
            <th>Namn</th>
            <th>Användarnamn</th>
            <th>E-post</th>
            <th>Telefon</th>
            <th>Roll</th>
            <th>Aktiv</th>
            <th>Åtgärd</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.Username">
            <td>{{ user.DisplayName }}</td>
            <td>{{ user.Username }}</td>
            <td>{{ user.Email }}</td>
            <td>{{ user.Phone }}</td>
            <td>
              <select v-model="user.Role" @change="saveUser(user)">
                <option value="U">U (Vanlig)</option>
                <option value="SU">SU (SuperUser)</option>
              </select>
            </td>
            <td>
              <input type="checkbox" v-model="user.IsActive" @change="saveUser(user)" />
            </td>
            <td>
              <button @click="deleteUser(user.Username)" class="btn-danger">Ta bort</button>
            </td>
          </tr>
        </tbody>
      </table>
 
      <h3>➕ Lägg till ny användare</h3>
      <form @submit.prevent="addUser" class="add-user-form">
        <input v-model="newUser.username" placeholder="Användarnamn (t.ex. 4g32)" required />
        <input v-model="newUser.displayName" placeholder="Namn" required />
        <input v-model="newUser.email" placeholder="E-post" />
        <input v-model="newUser.phone" placeholder="Telefon" />
        <select v-model="newUser.role">
          <option value="U">U</option>
          <option value="SU">SU</option>
        </select>
        <button type="submit">Lägg till</button>
      </form>
    </div>
  </div>
</template>
 
<script>
import axios from 'axios';
 
const API_BASE = 'http://sllbi01:3003'; // Byt till https om ni kör det
 
export default {
  props: ['visible'],
  emits: ['close'],
  data() {
    return {
      users: [],
      newUser: { username: '', displayName: '', email: '', phone: '', role: 'U' }
    };
  },
  watch: {
    visible(val) {
      if (val) this.loadUsers();
    }
  },
  methods: {
    async loadUsers() {
      const res = await axios.get(`${API_BASE}/api/admin/users`, { withCredentials: true });
      this.users = res.data;
    },
    async saveUser(user) {
      await axios.post(`${API_BASE}/api/admin/users`, user, { withCredentials: true });
    },
    async addUser() {
      await axios.post(`${API_BASE}/api/admin/users`, {
        username: this.newUser.username,
        displayName: this.newUser.displayName,
        email: this.newUser.email,
        phone: this.newUser.phone,
        role: this.newUser.role,
        isActive: true
      }, { withCredentials: true });
      this.newUser = { username: '', displayName: '', email: '', phone: '', role: 'U' };
      this.loadUsers();
    },
    async deleteUser(username) {
      if (!confirm(`Ta bort ${username}?`)) return;
      await axios.delete(`${API_BASE}/api/admin/users/${username}`, { withCredentials: true });
      this.loadUsers();
    },
    close() {
      this.$emit('close');
    }
  }
};
</script>