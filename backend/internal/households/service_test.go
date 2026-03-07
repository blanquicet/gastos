package households

import (
	"context"
	"strings"
	"testing"
)

func TestCreateHousehold(t *testing.T) {
	tests := []struct {
		name    string
		input   *CreateHouseholdInput
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid household",
			input: &CreateHouseholdInput{
				Name:   "My Household",
				UserID: "user-1",
			},
			wantErr: false,
		},
		{
			name: "empty name",
			input: &CreateHouseholdInput{
				Name:   "",
				UserID: "user-1",
			},
			wantErr: true,
			errMsg:  "household name is required",
		},
		{
			name: "name too long",
			input: &CreateHouseholdInput{
				Name:   strings.Repeat("a", 101),
				UserID: "user-1",
			},
			wantErr: true,
			errMsg:  "household name must be 100 characters or less",
		},
		{
			name: "user not found",
			input: &CreateHouseholdInput{
				Name:   "My Household",
				UserID: "nonexistent",
			},
			wantErr: true,
			errMsg:  "user not found",
		},
		{
			name: "whitespace trimmed",
			input: &CreateHouseholdInput{
				Name:   "  My Household  ",
				UserID: "user-1",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create fresh instances for each test
			repo := NewMockRepository()
			userRepo := NewMockUserRepository()
			auditSvc := &MockAuditService{}
			svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})
			userRepo.AddTestUser("user-1", "test@example.com", "Test User")

			household, err := svc.CreateHousehold(context.Background(), tt.input)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if household == nil {
				t.Error("expected household but got nil")
				return
			}

			expectedName := strings.TrimSpace(tt.input.Name)
			if household.Name != expectedName {
				t.Errorf("expected name %q, got %q", expectedName, household.Name)
			}
			if household.CreatedBy != tt.input.UserID {
				t.Errorf("expected created_by %q, got %q", tt.input.UserID, household.CreatedBy)
			}
			
			// Verify creator was added as owner
			members, err := repo.GetMembers(context.Background(), household.ID)
			if err != nil {
				t.Errorf("failed to get members: %v", err)
				return
			}
			if len(members) != 1 {
				t.Errorf("expected 1 member, got %d", len(members))
				return
			}
			if members[0].Role != RoleOwner {
				t.Errorf("expected creator to be owner, got %s", members[0].Role)
			}
		})
	}
}

func TestGetHousehold(t *testing.T) {
	repo := NewMockRepository()
	userRepo := NewMockUserRepository()
	auditSvc := &MockAuditService{}
	svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})

	userRepo.AddTestUser("user-1", "test@example.com", "Test User")
	household, _ := svc.CreateHousehold(context.Background(), &CreateHouseholdInput{
		Name:   "My Household",
		UserID: "user-1",
	})

	tests := []struct {
		name        string
		householdID string
		userID      string
		wantErr     bool
		errMsg      string
	}{
		{
			name:        "member can view",
			householdID: household.ID,
			userID:      "user-1",
			wantErr:     false,
		},
		{
			name:        "non-member cannot view",
			householdID: household.ID,
			userID:      "user-2",
			wantErr:     true,
			errMsg:      "not authorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, err := svc.GetHousehold(context.Background(), tt.householdID, tt.userID)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if h == nil {
				t.Error("expected household but got nil")
			}
		})
	}
}

func TestRemoveMember(t *testing.T) {
	repo := NewMockRepository()
	userRepo := NewMockUserRepository()
	auditSvc := &MockAuditService{}
	svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})

	user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
	user2 := userRepo.AddTestUser("user-2", "user2@example.com", "User 2")
	user3 := userRepo.AddTestUser("user-3", "user3@example.com", "User 3")

	household, _ := svc.CreateHousehold(context.Background(), &CreateHouseholdInput{
		Name:   "My Household",
		UserID: user1.ID,
	})

	// Add user2 as member
	repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)

	tests := []struct {
		name     string
		input    *RemoveMemberInput
		wantErr  bool
		errMsg   string
		preSetup func()
	}{
		{
			name: "owner can remove member",
			input: &RemoveMemberInput{
				HouseholdID: household.ID,
				MemberID:    user2.ID,
				UserID:      user1.ID,
			},
			wantErr: false,
		},
		{
			name: "member cannot remove other member",
			input: &RemoveMemberInput{
				HouseholdID: household.ID,
				MemberID:    user1.ID,
				UserID:      user2.ID,
			},
			wantErr: true,
			errMsg:  "not authorized",
			preSetup: func() {
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)
			},
		},
		{
			name: "member can remove themselves",
			input: &RemoveMemberInput{
				HouseholdID: household.ID,
				MemberID:    user2.ID,
				UserID:      user2.ID,
			},
			wantErr: false,
			preSetup: func() {
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)
			},
		},
		{
			name: "cannot remove last owner",
			input: &RemoveMemberInput{
				HouseholdID: household.ID,
				MemberID:    user1.ID,
				UserID:      user1.ID,
			},
			wantErr: true,
			errMsg:  "cannot remove last owner",
		},
		{
			name: "non-member cannot remove",
			input: &RemoveMemberInput{
				HouseholdID: household.ID,
				MemberID:    user2.ID,
				UserID:      user3.ID,
			},
			wantErr: true,
			errMsg:  "not authorized",
			preSetup: func() {
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.preSetup != nil {
				tt.preSetup()
			}

			err := svc.RemoveMember(context.Background(), tt.input)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestUpdateMemberRole(t *testing.T) {
	tests := []struct {
		name     string
		setup    func(*MockHouseholdRepository, *MockUserRepository) (string, string, string) // returns householdID, user1ID, user2ID
		input    func(householdID, user1ID, user2ID string) *UpdateMemberRoleInput
		wantErr  bool
		errMsg   string
	}{
		{
			name: "owner can promote member to owner",
			setup: func(repo *MockHouseholdRepository, userRepo *MockUserRepository) (string, string, string) {
				user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
				user2 := userRepo.AddTestUser("user-2", "user2@example.com", "User 2")
				household, _ := repo.Create(context.Background(), "Test", user1.ID)
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)
				return household.ID, user1.ID, user2.ID
			},
			input: func(householdID, user1ID, user2ID string) *UpdateMemberRoleInput {
				return &UpdateMemberRoleInput{
					HouseholdID: householdID,
					MemberID:    user2ID,
					Role:        RoleOwner,
					UserID:      user1ID,
				}
			},
			wantErr: false,
		},
		{
			name: "member cannot change roles",
			setup: func(repo *MockHouseholdRepository, userRepo *MockUserRepository) (string, string, string) {
				user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
				user2 := userRepo.AddTestUser("user-2", "user2@example.com", "User 2")
				household, _ := repo.Create(context.Background(), "Test", user1.ID)
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)
				return household.ID, user1.ID, user2.ID
			},
			input: func(householdID, user1ID, user2ID string) *UpdateMemberRoleInput {
				return &UpdateMemberRoleInput{
					HouseholdID: householdID,
					MemberID:    user1ID,
					Role:        RoleMember,
					UserID:      user2ID,
				}
			},
			wantErr: true,
			errMsg:  "not authorized",
		},
		{
			name: "cannot demote last owner",
			setup: func(repo *MockHouseholdRepository, userRepo *MockUserRepository) (string, string, string) {
				user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
				household, _ := repo.Create(context.Background(), "Test", user1.ID)
				return household.ID, user1.ID, ""
			},
			input: func(householdID, user1ID, user2ID string) *UpdateMemberRoleInput {
				return &UpdateMemberRoleInput{
					HouseholdID: householdID,
					MemberID:    user1ID,
					Role:        RoleMember,
					UserID:      user1ID,
				}
			},
			wantErr: true,
			errMsg:  "cannot demote yourself as the last owner",
		},
		{
			name: "can demote self when another owner exists",
			setup: func(repo *MockHouseholdRepository, userRepo *MockUserRepository) (string, string, string) {
				user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
				user2 := userRepo.AddTestUser("user-2", "user2@example.com", "User 2")
				household, _ := repo.Create(context.Background(), "Test", user1.ID)
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleOwner)
				return household.ID, user1.ID, user2.ID
			},
			input: func(householdID, user1ID, user2ID string) *UpdateMemberRoleInput {
				return &UpdateMemberRoleInput{
					HouseholdID: householdID,
					MemberID:    user1ID,
					Role:        RoleMember,
					UserID:      user1ID,
				}
			},
			wantErr: false,
		},
		{
			name: "invalid role",
			setup: func(repo *MockHouseholdRepository, userRepo *MockUserRepository) (string, string, string) {
				user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
				user2 := userRepo.AddTestUser("user-2", "user2@example.com", "User 2")
				household, _ := repo.Create(context.Background(), "Test", user1.ID)
				repo.AddMember(context.Background(), household.ID, user2.ID, RoleMember)
				return household.ID, user1.ID, user2.ID
			},
			input: func(householdID, user1ID, user2ID string) *UpdateMemberRoleInput {
				return &UpdateMemberRoleInput{
					HouseholdID: householdID,
					MemberID:    user2ID,
					Role:        "invalid",
					UserID:      user1ID,
				}
			},
			wantErr: true,
			errMsg:  "invalid role",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := NewMockRepository()
			userRepo := NewMockUserRepository()
			auditSvc := &MockAuditService{}
			svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})

			householdID, user1ID, user2ID := tt.setup(repo, userRepo)
			input := tt.input(householdID, user1ID, user2ID)

			member, err := svc.UpdateMemberRole(context.Background(), input)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if member == nil {
				t.Error("expected member but got nil")
			}
		})
	}
}

func TestCreateContact(t *testing.T) {
	repo := NewMockRepository()
	userRepo := NewMockUserRepository()
	auditSvc := &MockAuditService{}
	svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})

	user1 := userRepo.AddTestUser("user-1", "user1@example.com", "User 1")
	user2 := userRepo.AddTestUser("user-2", "user2@example.com", "User 2")

	household, _ := svc.CreateHousehold(context.Background(), &CreateHouseholdInput{
		Name:   "My Household",
		UserID: user1.ID,
	})

	email := "contact@example.com"
	linkedEmail := user2.Email

	tests := []struct {
		name            string
		input           *CreateContactInput
		wantErr         bool
		errMsg          string
		checkAutoLinked bool
	}{
		{
			name: "valid unlinked contact",
			input: &CreateContactInput{
				HouseholdID: household.ID,
				Name:        "Test Contact",
				Email:       &email,
				UserID:      user1.ID,
			},
			wantErr:         false,
			checkAutoLinked: false,
		},
		{
			name: "no auto-link when email matches user",
			input: &CreateContactInput{
				HouseholdID: household.ID,
				Name:        "User 2",
				Email:       &linkedEmail,
				UserID:      user1.ID,
			},
			wantErr:         false,
			checkAutoLinked: false,
		},
		{
			name: "empty name",
			input: &CreateContactInput{
				HouseholdID: household.ID,
				Name:        "",
				Email:       &email,
				UserID:      user1.ID,
			},
			wantErr: true,
			errMsg:  "contact name is required",
		},
		{
			name: "non-member cannot create contact",
			input: &CreateContactInput{
				HouseholdID: household.ID,
				Name:        "Test",
				UserID:      user2.ID,
			},
			wantErr: true,
			errMsg:  "not authorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			contact, err := svc.CreateContact(context.Background(), tt.input)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if contact == nil {
				t.Error("expected contact but got nil")
				return
			}

			if tt.checkAutoLinked {
				if contact.LinkedUserID == nil {
					t.Error("expected contact to be auto-linked but LinkedUserID is nil")
				} else if *contact.LinkedUserID != user2.ID {
					t.Errorf("expected LinkedUserID to be %q, got %q", user2.ID, *contact.LinkedUserID)
				}
			}
		})
	}
}

func TestPromoteContactToMember(t *testing.T) {
	repo := NewMockRepository()
	userRepo := NewMockUserRepository()
	auditSvc := &MockAuditService{}
	svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})

	owner := userRepo.AddTestUser("owner", "owner@example.com", "Owner")
	member := userRepo.AddTestUser("member", "member@example.com", "Member")
	linkedUser := userRepo.AddTestUser("linked", "linked@example.com", "Linked User")

	household, _ := svc.CreateHousehold(context.Background(), &CreateHouseholdInput{
		Name:   "My Household",
		UserID: owner.ID,
	})

	repo.AddMember(context.Background(), household.ID, member.ID, RoleMember)

	// Create linked contact (with explicit link request)
	linkedEmail := linkedUser.Email
	linkedContact, _ := svc.CreateContact(context.Background(), &CreateContactInput{
		HouseholdID: household.ID,
		Name:        "Linked Contact",
		Email:       &linkedEmail,
		UserID:      owner.ID,
		RequestLink: true,
	})

	// Create unlinked contact
	email := "unlinked@example.com"
	unlinkedContact, _ := svc.CreateContact(context.Background(), &CreateContactInput{
		HouseholdID: household.ID,
		Name:        "Unlinked Contact",
		Email:       &email,
		UserID:      owner.ID,
	})

	tests := []struct {
		name    string
		input   *PromoteContactInput
		wantErr bool
		errMsg  string
	}{
		{
			name: "owner can promote linked contact",
			input: &PromoteContactInput{
				ContactID:   linkedContact.ID,
				HouseholdID: household.ID,
				UserID:      owner.ID,
			},
			wantErr: false,
		},
		{
			name: "member cannot promote contact",
			input: &PromoteContactInput{
				ContactID:   linkedContact.ID,
				HouseholdID: household.ID,
				UserID:      member.ID,
			},
			wantErr: true,
			errMsg:  "not authorized",
		},
		{
			name: "cannot promote unlinked contact",
			input: &PromoteContactInput{
				ContactID:   unlinkedContact.ID,
				HouseholdID: household.ID,
				UserID:      owner.ID,
			},
			wantErr: true,
			errMsg:  "contact is not linked",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			newMember, err := svc.PromoteContactToMember(context.Background(), tt.input)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if newMember == nil {
				t.Error("expected member but got nil")
			}
		})
	}
}

func TestGenerateInvitationToken(t *testing.T) {
	token1, err := GenerateInvitationToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token1 == "" {
		t.Error("expected non-empty token")
	}

	token2, err := GenerateInvitationToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token1 == token2 {
		t.Error("expected different tokens")
	}
}

func TestDeleteHousehold(t *testing.T) {
	repo := NewMockRepository()
	userRepo := NewMockUserRepository()
	auditSvc := &MockAuditService{}
	svc := NewService(repo, userRepo, &MockCategoriesRepo{}, auditSvc, &MockEmailSender{})

	owner := userRepo.AddTestUser("owner", "owner@example.com", "Owner")
	member := userRepo.AddTestUser("member", "member@example.com", "Member")

	household, _ := svc.CreateHousehold(context.Background(), &CreateHouseholdInput{
		Name:   "My Household",
		UserID: owner.ID,
	})

	repo.AddMember(context.Background(), household.ID, member.ID, RoleMember)

	tests := []struct {
		name        string
		householdID string
		userID      string
		wantErr     bool
		errMsg      string
	}{
		{
			name:        "owner can delete",
			householdID: household.ID,
			userID:      owner.ID,
			wantErr:     false,
		},
		{
			name:        "member cannot delete",
			householdID: household.ID,
			userID:      member.ID,
			wantErr:     true,
			errMsg:      "not authorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.DeleteHousehold(context.Background(), tt.householdID, tt.userID)
			
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}
