# Households API Testing Guide - Postman

## Prerequisites

1. **Start the backend server:**
   ```bash
   cd backend
   docker compose up -d  # Start PostgreSQL
   go run cmd/api/main.go  # Start API server
   ```

2. **Import the collection into Postman:**
   - Open Postman Desktop App
   - Click "Import" button
   - Select `Gastos_Households_API.postman_collection.json`
   - Collection will appear in left sidebar

3. **Verify server is running:**
   - Server should be at: `http://localhost:8080`
   - Test with: `GET http://localhost:8080/health`
   - Should return: `{"status": "healthy"}`

---

## Step-by-Step Testing Flow

### Phase 1: Authentication Setup (Required First!)

**✅ Step 1.1: Register User 1 (Jose)**
- **Request:** `POST /auth/register`
- **Body:**
  ```json
  {
    "email": "jose@test.com",
    "name": "Jose",
    "password": "Test1234!",
    "password_confirm": "Test1234!"
  }
  ```
- **Expected:** `201 Created`
- **Check:** Session cookie `gastos_session` is set in Cookies tab
- **⚠️ Important:** Keep this tab open or note the cookie value

**✅ Step 1.2: Get Current User**
- **Request:** `GET /me`
- **Expected:** `200 OK`
- **Response should contain:**
  ```json
  {
    "id": "some-uuid",
    "email": "jose@test.com",
    "name": "Jose"
  }
  ```
- **✅ If this works:** You're authenticated correctly!

**✅ Step 1.3: Register User 2 (Caro)** *(For member testing later)*
- **Request:** `POST /auth/register`
- **Body:**
  ```json
  {
    "email": "caro@test.com",
    "name": "Caro",
    "password": "Test1234!",
    "password_confirm": "Test1234!"
  }
  ```
- **Expected:** `201 Created`
- **Note:** This creates Caro but logs you in as Caro. You'll need to log back in as Jose.

**✅ Step 1.4: Login as Jose** *(Switch back to Jose)*
- **Request:** `POST /auth/login`
- **Body:**
  ```json
  {
    "email": "jose@test.com",
    "password": "Test1234!"
  }
  ```
- **Expected:** `200 OK`
- **Check:** Session cookie updated to Jose's session

---

### Phase 2: Household Management

**✅ Step 2.1: Create Household**
- **Request:** `POST /households`
- **Body:**
  ```json
  {
    "name": "Casa de Jose y Caro"
  }
  ```
- **Expected:** `201 Created`
- **Response:**
  ```json
  {
    "id": "household-uuid",  // 👈 COPY THIS ID!
    "name": "Casa de Jose y Caro",
    "created_by": "jose-user-id",
    "currency": "COP",
    "timezone": "America/Bogota",
    ...
  }
  ```
- **📝 Action:** Copy the `id` field - you'll need it for next requests
- **💡 Postman Tip:** The collection should auto-save this to `{{householdId}}` variable

**✅ Step 2.2: List Households**
- **Request:** `GET /households`
- **Expected:** `200 OK`
- **Response:**
  ```json
  {
    "households": [
      {
        "id": "household-uuid",
        "name": "Casa de Jose y Caro",
        ...
      }
    ]
  }
  ```
- **✅ Verify:** You see the household you just created

**✅ Step 2.3: Get Household Details**
- **Request:** `GET /households/{{householdId}}`
- **Expected:** `200 OK`
- **Response should include:**
  ```json
  {
    "id": "household-uuid",
    "name": "Casa de Jose y Caro",
    "members": [
      {
        "user_id": "jose-user-id",
        "role": "owner",  // 👈 You should be owner!
        "user_email": "jose@test.com",
        "user_name": "Jose"
      }
    ],
    "contacts": []  // Empty initially
  }
  ```
- **✅ Verify:** 
  - You're listed as a member with role "owner"
  - Contacts array exists (even if empty)

**✅ Step 2.4: Update Household Name**
- **Request:** `PATCH /households/{{householdId}}`
- **Body:**
  ```json
  {
    "name": "Mi Hogar Actualizado"
  }
  ```
- **Expected:** `200 OK`
- **Response:**
  ```json
  {
    "id": "household-uuid",
    "name": "Mi Hogar Actualizado",  // 👈 Name changed!
    ...
  }
  ```

---

### Phase 3: Member Management

**✅ Step 3.1: Add Member (Caro)**
- **Request:** `POST /households/{{householdId}}/members`
- **Body:**
  ```json
  {
    "email": "caro@test.com"
  }
  ```
- **Expected:** `201 Created`
- **Response:**
  ```json
  {
    "id": "member-uuid",
    "household_id": "household-uuid",
    "user_id": "caro-user-id",  // 👈 COPY THIS for role update!
    "role": "member",
    "user_email": "caro@test.com",
    "user_name": "Caro"
  }
  ```
- **📝 Action:** Copy the `user_id` - needed for next step
- **💡 Note:** Caro is added as "member" (not "owner")

**✅ Step 3.2: Promote Member to Owner**
- **Request:** `PATCH /households/{{householdId}}/members/{{memberId}}/role`
  - Replace `{{memberId}}` with Caro's `user_id` from previous step
- **Body:**
  ```json
  {
    "role": "owner"
  }
  ```
- **Expected:** `200 OK`
- **Response:**
  ```json
  {
    "user_id": "caro-user-id",
    "role": "owner",  // 👈 Promoted!
    ...
  }
  ```

**✅ Step 3.3: Verify Members List**
- **Request:** `GET /households/{{householdId}}` (Get Details again)
- **Expected:** `200 OK`
- **✅ Verify:** `members` array now shows 2 owners:
  - Jose (owner)
  - Caro (owner)

---

### Phase 4: Contact Management

**✅ Step 4.1: Create Unlinked Contact**
- **Request:** `POST /households/{{householdId}}/contacts`
- **Body:**
  ```json
  {
    "name": "Papá",
    "email": "papa@test.com",
    "phone": "+57 300 123 4567",
    "notes": "Familia - padre"
  }
  ```
- **Expected:** `201 Created`
- **Response:**
  ```json
  {
    "id": "contact-uuid",  // 👈 COPY THIS for update/delete!
    "household_id": "household-uuid",
    "name": "Papá",
    "email": "papa@test.com",
    "phone": "+57 300 123 4567",
    "linked_user_id": null,  // 👈 Not linked (papa@test.com not registered)
    "is_registered": false,  // 👈 Not a registered user
    "notes": "Familia - padre",
    ...
  }
  ```
- **📝 Action:** Copy the contact `id` for next steps

**✅ Step 4.2: Create Auto-Linked Contact**
- **Request:** `POST /households/{{householdId}}/contacts`
- **Body:**
  ```json
  {
    "name": "Maria (will auto-link to Caro)",
    "email": "caro@test.com"
  }
  ```
- **Expected:** `201 Created`
- **Response:**
  ```json
  {
    "id": "contact-uuid-2",
    "name": "Maria (will auto-link to Caro)",
    "email": "caro@test.com",
    "linked_user_id": "caro-user-id",  // 👈 AUTO-LINKED!
    "is_registered": true,  // 👈 Caro is registered!
    ...
  }
  ```
- **✅ Verify:** `linked_user_id` is set and matches Caro's user ID

**✅ Step 4.3: Update Contact**
- **Request:** `PATCH /households/{{householdId}}/contacts/{{contactId}}`
  - Replace `{{contactId}}` with contact ID from Step 4.1
- **Body:**
  ```json
  {
    "name": "Papa Juan",
    "email": "papa@test.com",
    "phone": "+57 300 999 8888",
    "notes": "Padre - updated"
  }
  ```
- **Expected:** `200 OK`
- **✅ Verify:** Name changed from "Papá" to "Papa Juan"

**✅ Step 4.4: List Contacts**
- **Request:** `GET /households/{{householdId}}` (Get Details again)
- **Expected:** `200 OK`
- **✅ Verify:** `contacts` array shows both contacts:
  1. Papa Juan (unlinked)
  2. Maria (linked to Caro)

**✅ Step 4.5: Delete Contact**
- **Request:** `DELETE /households/{{householdId}}/contacts/{{contactId}}`
- **Expected:** `204 No Content` (empty response)
- **✅ Verify:** Contact deleted
- **Check:** Get household details again - contact should be gone

**✅ Step 4.6: Promote Linked Contact** *(Optional - Advanced)*
- First, create a new linked contact (use Caro's email)
- Then: `POST /households/{{householdId}}/contacts/{{linkedContactId}}/promote`
- **Expected:** `201 Created`
- **Result:** Contact becomes a member, contact deleted
- **⚠️ Note:** Only works for linked contacts!

---

### Phase 5: Error Cases (Validation Testing)

**❌ Step 5.1: Unauthorized Access**
- **Setup:** Clear cookies or use Incognito request
- **Request:** `POST /households` with body `{"name": "Test"}`
- **Expected:** `401 Unauthorized`
- **Error:** `{"error": "no autorizado"}`

**❌ Step 5.2: Add Duplicate Member**
- **Request:** `POST /households/{{householdId}}/members`
- **Body:** `{"email": "caro@test.com"}` (Caro is already a member!)
- **Expected:** `409 Conflict`
- **Error:** `{"error": "el usuario ya es miembro del hogar"}`

**❌ Step 5.3: Non-Existent Household**
- **Request:** `GET /households/00000000-0000-0000-0000-000000000000`
- **Expected:** `403 Forbidden` or `404 Not Found`
- **Error:** `{"error": "no autorizado"}` or `{"error": "hogar no encontrado"}`

**❌ Step 5.4: Cannot Remove Last Owner** *(Edge Case)*
- **Setup:** Remove Caro from household (or demote to member)
- **Request:** Try to delete yourself as the only owner
- **Expected:** `400 Bad Request`
- **Error:** `{"error": "no se puede eliminar el último propietario"}`

**❌ Step 5.5: Member Cannot Delete Household** *(Authorization)*
- **Setup:** Login as Caro (who is member, not owner)
- **Request:** `DELETE /households/{{householdId}}`
- **Expected:** `403 Forbidden`
- **Error:** `{"error": "no autorizado"}`

---

## ✅ Success Criteria

After completing all steps, you should have:

- ✅ 2 registered users (Jose, Caro)
- ✅ 1 household with 2 owners
- ✅ 1+ contacts (some linked, some unlinked)
- ✅ Verified auto-linking works (email match = linked)
- ✅ Verified authorization (owner vs member permissions)
- ✅ Verified all CRUD operations work
- ✅ Verified error cases return correct status codes

---

## 🐛 Troubleshooting

### "401 Unauthorized" on all requests
- **Issue:** Session cookie not being sent
- **Fix:** Check Cookies tab in Postman, ensure `gastos_session` cookie exists
- **Fix:** Re-login with `POST /auth/login`

### "Household not found" but ID is correct
- **Issue:** Not a member of that household
- **Fix:** Verify you're logged in as the correct user
- **Fix:** Use `GET /households` to see your households

### "Cannot find module" in test scripts
- **Solution:** Ignore - these are for Newman (CLI). Just check the Response tab manually

### Variables not auto-populating
- **Fix:** Manually copy IDs from responses and paste into URL paths
- **Example:** Copy household `id` from Create response, paste into Get Household URL

---

## 📊 Quick Test Checklist

Use this checklist to verify everything works:

```
Phase 1: Auth
□ Register Jose
□ Login Jose  
□ Get current user (verify authenticated)

Phase 2: Households
□ Create household
□ List households (verify created)
□ Get household details (verify members array)
□ Update household name

Phase 3: Members
□ Add Caro as member
□ Promote Caro to owner
□ Verify 2 owners in household

Phase 4: Contacts
□ Create unlinked contact (random email)
□ Create linked contact (caro@test.com - should auto-link)
□ Update contact
□ Delete contact
□ Verify contacts list

Phase 5: Errors
□ Try creating household without auth (401)
□ Try adding duplicate member (409)
□ Try accessing non-existent household (403/404)
```

---

## 🎯 Next Steps After Testing

Once all tests pass in Postman:
1. Document any issues found
2. Create screenshots for documentation
3. Export collection with test results
4. Ready for frontend integration (Phase 2B)!

