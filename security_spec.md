# MediStream Firestore Security Specification

## 1. Data Invariants
1. All non-catalog collections (`users`, `patients`, `appointments`, `payments`, `reminders`, `encounters`, `prescriptions`, `labOrders`, `referrals`, `auditLogs`, `system`) require an authenticated, verified Firebase user (`request.auth != null && request.auth.token.email_verified == true`), except public non-PII catalog reads on `/departments`, `/doctors`, and `/ambulances`.
2. Users cannot self-assign `admin`, `doctor`, or `staff` roles on `/users/{userId}` creation; client-created profiles are strictly forced to `role == 'patient'` and `active == true`.
3. User PII (`email`, `patientId`) is strictly isolated in `/users/{userId}/private/{docId}` and readable/writable only by the owning user or an Admin.
4. All patient charts (`/patients/{patientId}`), appointments (`/appointments/{appointmentId}`), payments (`/payments/{paymentId}`), reminders (`/reminders/{reminderId}`), clinical encounters (`/encounters/{encounterId}`), e-prescriptions (`/prescriptions/{prescriptionId}`), lab orders (`/labOrders/{orderId}`), and specialist referrals (`/referrals/{referralId}`) bind `ownerUid` immutably and restrict patient reads strictly to their own records while permitting authorized Admin governance.
5. Terminal state transitions: Appointments with `status` of `'Completed'` or `'Cancelled'` and Payments with `status == 'Paid'` cannot be modified by non-admin users.
6. Every document ID must match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), every string enforces bounded `.size()`, and every server timestamp enforces `request.time`.

## 2. Adversarial "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Privilege Escalation on User Profile Create**: User `u1` creates `/users/u1` with `role: "admin"`.
2. **Shadow Field Injection on User Profile**: User `u1` creates `/users/u1` with extra ghost field `isSuperAdmin: true`.
3. **Cross-User PII Read**: Authenticated user `u2` reads `/users/u1/private/info`.
4. **Role Tampering on Update**: User `u1` updates `/users/u1` changing `role` from `"patient"` to `"doctor"`.
5. **Unverified Email Spoofing**: Unverified user (`email_verified: false`) with email `mogow881@gmail.com` writes to `/doctors/doc-1`.
6. **Spoofed Appointment Owner**: User `u2` creates `/appointments/apt-999` with `ownerUid: "u1"`.
7. **ID Poisoning**: User `u1` creates `/appointments/` with an invalid or >128 char document ID containing `$` or `/`.
8. **Terminal State Bypass**: User `u1` updates `/appointments/apt-1` from `status: "Cancelled"` back to `"Confirmed"`.
9. **Paid Payment Mutation**: User `u1` updates `/payments/pay-1` (`status: "Paid"`) to change `totalAmount: 1`.
10. **Blanket List Query Scraping**: User `u2` queries `/appointments` without `where('ownerUid', '==', 'u2')`.
11. **Backdated Timestamp Forgery**: User `u1` creates `/appointments/apt-2` with client-supplied past `createdAt` instead of `request.time`.
12. **Audit Log Deletion / Tampering**: User `u1` or even Admin attempts to update or delete `/auditLogs/aud-1`.
