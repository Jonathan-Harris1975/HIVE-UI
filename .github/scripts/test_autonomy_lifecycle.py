"""Regression checks for repair retirement; all GitHub writes are mocked."""
import copy
import inspect
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import unittest
import native_auto_merge
from unittest.mock import patch

os.environ.setdefault("GH_TOKEN", "unit-test")
os.environ.setdefault("GITHUB_REPOSITORY", "owner/repo")

import branch_pr_automation as branch_controller  # noqa: E402
import trusted_automation as automation  # noqa: E402
import autonomy_admission_check as admission_check  # noqa: E402


class RoutineUnitTestRiskClassificationTests(unittest.TestCase):
    def test_regular_unit_tests_are_low_risk_but_security_tests_stay_high_risk(self):
        with patch.object(automation, "REPO", "Jonathan-Harris1975/AIMS"):
            self.assertFalse(automation.sensitive_file("tests/unit/test_routes.py"))
            self.assertFalse(automation.sensitive_file("test/widgets/widget.test.ts"))
            self.assertTrue(automation.sensitive_file("tests/security/test_policy.py"))
            self.assertTrue(automation.sensitive_file("tests/test_auth.py"))


class RepairRetirementTests(unittest.TestCase):
    def setUp(self):
        self.current = "a" * 40
        self.pr = {
            "number": 1,
            "state": "open",
            "title": "[autonomy] Repair CI failure (123)",
            "user": {"login": "repair[bot]"},
            "head": {"ref": "autonomy/repair-123", "repo": {"full_name": "owner/repo"}},
            "base": {"ref": "main"},
            "labels": [{"name": "autonomy:repair"}],
            "body": f"Failed commit: `{self.current}`",
        }
        for name, value in {"REPO": "owner/repo", "REPAIR_APP_LOGIN": "repair[bot]", "DEFAULT_BRANCH": "main"}.items():
            self.enterContext(patch.object(automation, name, value))
        self.enterContext(patch.object(automation, "get", return_value={"commit": {"sha": self.current}}))
        self.write = self.enterContext(patch.object(automation, "request"))
        self.labels = self.enterContext(patch.object(automation, "add_labels"))
        self.delete = self.enterContext(patch.object(automation, "delete"))
        self.enterContext(patch.object(automation, "log"))

    def retire(self):
        automation.reconcile_stale_carriers([copy.deepcopy(self.pr)])

    def test_current_unresolved_carrier_remains_open(self):
        self.retire()
        self.write.assert_not_called()

    def test_current_human_hold_remains_open(self):
        self.pr["labels"].append({"name": "autonomy:human-hold"})
        self.retire()
        self.write.assert_not_called()
        self.delete.assert_not_called()

    def test_obsolete_carrier_closes_even_at_current_sha(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.retire()
        self.write.assert_called_once_with("PATCH", "/repos/owner/repo/pulls/1", {"state": "closed"})
        self.delete.assert_called_once_with("/repos/owner/repo/issues/1/labels/autonomy%3Arepair", expected=(200, 204))

    def test_retirement_retries_after_active_label_was_removed(self):
        self.pr["labels"] = [{"name": "autonomy:superseded"}]
        self.retire()
        self.write.assert_called_once()

    def test_stale_carrier_is_labelled_and_closed(self):
        self.pr["body"] = f"Failed commit: `{'b' * 40}`"
        self.retire()
        self.labels.assert_called_once_with(1, ["autonomy:obsolete"])
        self.write.assert_called_once()

    def test_impostor_and_implementation_are_never_retired(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.pr["user"]["login"] = "another-user"
        self.retire()
        self.pr["user"]["login"] = "repair[bot]"
        self.pr["head"]["ref"] = "implementation/fix"
        self.retire()
        self.write.assert_not_called()

    def test_fork_carrier_is_never_retired(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.pr["head"]["repo"]["full_name"] = "fork/repo"
        self.retire()
        self.write.assert_not_called()

    def test_failed_close_keeps_active_labels_for_retry(self):
        self.pr["labels"].append({"name": "autonomy:obsolete"})
        self.write.side_effect = RuntimeError("simulated unavailable API")
        with self.assertRaises(RuntimeError):
            self.retire()
        self.delete.assert_not_called()


class ManagedBranchOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.sha = "c" * 40
        self.pr = {
            "number": 22,
            "state": "open",
            "draft": False,
            "title": "Implement requested change",
            "user": {"login": "repair[bot]"},
            "head": {
                "ref": "codex/requested-change",
                "sha": self.sha,
                "repo": {"full_name": "Jonathan-Harris1975/HIVE-UI"},
            },
            "base": {"ref": "main"},
            "labels": [{"name": "automation:branch-pr"}],
            "body": "",
        }
        for name, value in {
            "REPO": "Jonathan-Harris1975/HIVE-UI",
            "REPAIR_APP_LOGIN": "repair[bot]",
            "DEFAULT_BRANCH": "main",
        }.items():
            self.enterContext(patch.object(automation, name, value))
        self.enterContext(patch.object(automation, "log"))
        self.enterContext(patch.object(automation, "has_operator_risk_approval", return_value=False))

    def test_branch_controller_has_no_merge_authority(self):
        source = inspect.getsource(branch_controller)
        self.assertNotIn("enablePullRequestAutoMerge", source)
        self.assertNotIn("disablePullRequestAutoMerge", source)
        self.assertNotIn('gh", "pr", "merge', source)

    def test_managed_branch_pr_is_admitted_to_github_native_auto_merge_after_green_checks(self):
        admit = self.enterContext(patch.object(automation, "admit_to_github_native_auto_merge"))
        approve = self.enterContext(patch.object(automation, "approve_pr"))
        self.enterContext(
            patch.object(automation, "pr_files", return_value=["src/example.ts"])
        )
        self.enterContext(
            patch.object(
                automation,
                "all_required_checks_green",
                return_value=(True, "green"),
            )
        )
        self.enterContext(
            patch.object(automation, "current_head_unchanged", return_value=self.pr)
        )

        automation.reconcile_pr(copy.deepcopy(self.pr))

        admit.assert_called_once_with(22, self.sha)
        approve.assert_not_called()

    def test_managed_branch_pr_touching_governance_gets_human_hold(self):
        risk_label = self.enterContext(patch.object(automation, "add_labels"))
        self.enterContext(patch.object(automation, "comment"))
        hold = self.enterContext(patch.object(automation, "place_human_hold"))
        admit = self.enterContext(patch.object(automation, "admit_to_github_native_auto_merge"))
        self.enterContext(
            patch.object(automation, "pr_files", return_value=[".github/workflows/security.yml"])
        )
        self.enterContext(patch.object(automation, "has_operator_risk_approval", return_value=False))

        automation.reconcile_pr(copy.deepcopy(self.pr))

        hold.assert_not_called()
        admit.assert_not_called()
        risk_label.assert_called_once_with(self.pr["number"], [automation.RISK_APPROVAL_LABEL])

class MergedKiloRepairSourceTests(unittest.TestCase):
    def setUp(self):
        self.receipt_sha = "a" * 40
        self.source_sha = "b" * 40
        self.implementation_sha = "c" * 40
        self.pr = {
            "number": 226,
            "user": {"login": "kilo-code-bot[bot]"},
            "head": {
                "sha": self.implementation_sha,
                "repo": {"full_name": "Jonathan-Harris1975/HIVE-UI"},
            },
            "body": "Source: https://github.com/Jonathan-Harris1975/HIVE-UI/pull/224",
        }
        self.source = {
            "number": 224,
            "state": "closed",
            "merged_at": "2026-11-18T14:54:26Z",
            "user": {"login": "Jonathan-Harris1975"},
            "head": {
                "sha": self.source_sha,
                "repo": {"full_name": "Jonathan-Harris1975/HIVE-UI"},
            },
            "html_url": "https://github.com/Jonathan-Harris1975/HIVE-UI/pull/224",
        }
        self.receipt = {
            "user": {"login": "github-actions[bot]"},
            "body": f"<!-- kilo-auto-repair:{self.receipt_sha}:review -->\\ndispatch-state: accepted",
        }
        self.enterContext(patch.object(automation, "REPO", "Jonathan-Harris1975/HIVE-UI"))
        self.enterContext(patch.object(automation, "KILO_LOGIN", "kilo-code-bot[bot]"))

    def mock_get(self, path):
        if path.endswith("/pulls/224"):
            return self.source
        if path.endswith(f"/compare/{self.source_sha}...{self.implementation_sha}"):
            return {"behind_by": 0, "status": "ahead"}
        if path.endswith(f"/compare/{self.receipt_sha}...{self.source_sha}"):
            return {"behind_by": 0, "status": "ahead"}
        raise AssertionError(f"Unexpected GitHub API call: {path}")

    def verify(self):
        with (
            patch.object(automation, "get", side_effect=self.mock_get),
            patch.object(automation, "carrier_comments", return_value=[self.receipt]),
        ):
            return automation.linked_kilo_merged_review_source(self.pr)

    def test_valid_merged_source_with_ancestral_receipt_is_admitted(self):
        self.assertEqual(self.verify(), 224)

    def test_pending_repair_receipt_is_rejected(self):
        self.receipt["body"] = f"<!-- kilo-auto-repair:{self.source_sha}:review -->\\ndispatch-state: queued"
        self.assertIsNone(self.verify())

    def test_verified_merged_source_can_be_adopted_without_open_source_pr(self):
        self.pr["labels"] = []
        with (
            patch.object(automation, "get", side_effect=self.mock_get),
            patch.object(automation, "carrier_comments", return_value=[self.receipt]),
            patch.object(automation, "linked_kilo_carrier", return_value=None),
            patch.object(automation, "linked_kilo_review_source", return_value=None),
            patch.object(automation, "add_labels") as add_labels,
            patch.object(automation, "log"),
        ):
            automation.adopt_linked_kilo_prs([self.pr])
            add_labels.assert_called_once_with(226, ["autonomy:repair", "autonomy:kilo-implementation"])

    def test_missing_verified_actions_receipt_is_rejected(self):
        self.receipt["user"]["login"] = "untrusted[bot]"
        self.assertIsNone(self.verify())

    def test_unmerged_source_is_rejected(self):
        self.source["merged_at"] = None
        self.assertIsNone(self.verify())

    def test_forked_source_is_rejected(self):
        self.source["head"]["repo"]["full_name"] = "another-owner/HIVE-UI"
        self.assertIsNone(self.verify())

    def test_unlinked_source_is_rejected(self):
        self.pr["body"] = "Unrelated issue https://github.com/other/repo/pull/224"
        self.assertIsNone(self.verify())

    def test_repair_receipt_must_precede_merged_source_head(self):
        def diverged_receipt(path):
            if path.endswith("/pulls/224"):
                return self.source
            if path.endswith(f"/compare/{self.source_sha}...{self.implementation_sha}"):
                return {"behind_by": 0, "status": "ahead"}
            if path.endswith(f"/compare/{self.receipt_sha}...{self.source_sha}"):
                return {"behind_by": 1, "status": "diverged"}
            raise AssertionError(f"Unexpected API call: {path}")
        with (
            patch.object(automation, "get", side_effect=diverged_receipt),
            patch.object(automation, "carrier_comments", return_value=[self.receipt]),
        ):
            self.assertIsNone(automation.linked_kilo_merged_review_source(self.pr))

    def test_kilo_authored_source_cannot_self_attest(self):
        self.source["user"]["login"] = "kilo-code-bot[bot]"
        self.assertIsNone(self.verify())

    def test_source_head_not_ancestor_of_implementation_is_rejected(self):
        def non_ancestor(path):
            if path.endswith("/pulls/224"):
                return self.source
            if path.endswith(f"/compare/{self.source_sha}...{self.implementation_sha}"):
                return {"behind_by": 1, "status": "diverged"}
            raise AssertionError(f"Unexpected API call: {path}")
        with patch.object(automation, "get", side_effect=non_ancestor):
            self.assertIsNone(automation.linked_kilo_merged_review_source(self.pr))


class KiloPermissionPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[2]
        cls.policy = json.loads((root / "kilo.jsonc").read_text(encoding="utf-8"))

    def test_kilo_is_non_interactive_and_governance_is_not_self_editable(self):
        permission = self.policy["permission"]
        self.assertEqual(permission["question"], "deny")
        self.assertEqual(permission["external_directory"], "deny")
        for tool in ("edit", "write", "apply_patch"):
            rules = permission[tool]
            self.assertEqual(rules["*"], "allow")
            for path in ("kilo.jsonc", ".github/workflows/*", ".github/scripts/*", ".github/production-governance.json", "renovate.json"):
                self.assertEqual(rules[path], "deny")

    def test_production_governance_contract_is_sensitive(self):
        self.assertTrue(automation.sensitive_file(".github/production-governance.json"))

    def test_shell_is_deny_by_default_with_only_safe_branch_pushes(self):
        bash = self.policy["permission"]["bash"]
        self.assertEqual(bash["*"], "deny")
        for command in (
            "git push origin HEAD",
            "git push --set-upstream origin HEAD",
            "git push -u origin HEAD",
        ):
            self.assertEqual(bash[command], "allow")
        for command in (
            "git push *:*",
            "git push +*",
            "git push --force",
            "git push -f",
            "git push --force-with-lease",
            "git push --mirror",
            "git push --delete",
            "bash -c *",
            "sh -c *",
            "gh pr merge *",
            "wrangler deploy *",
            "npx wrangler deploy *",
        ):
            self.assertEqual(bash[command], "deny")


class ProductionGovernanceProtectionTests(unittest.TestCase):
    def test_contract_is_sensitive_and_kilo_cannot_mutate_it(self):
        path = ".github/production-governance.json"
        self.assertTrue(automation.sensitive_file(path))
        root = Path(__file__).resolve().parents[2]
        policy = json.loads((root / "kilo.jsonc").read_text(encoding="utf-8"))
        for tool in ("edit", "write", "apply_patch"):
            self.assertEqual(policy["permission"][tool][path], "deny")



    def test_main_repair_reserves_marker_before_kilo_and_acknowledges_after(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / "workflows/autonomous-repair.yml").read_text(encoding="utf-8")
        self.assertIn(chr(10) + '            reservation_id="$(gh api --method POST', workflow)
        self.assertIn(chr(10) + '            status="$(curl', workflow)
        dispatch = workflow.split("dispatch_kilo() {", 1)[1].split("\n          }", 1)[0]
        reservation = dispatch.index("gh api --method POST")
        request = dispatch.index('status="$(curl')
        acknowledgement = dispatch.index("gh api --method PATCH")
        self.assertLess(reservation, request)
        self.assertLess(request, acknowledgement)
        self.assertIn('--field body="$marker', dispatch)
        self.assertIn("--jq '.id'", dispatch)
        self.assertIn("if ! gh api --method PATCH", dispatch)
        self.assertIn("dispatch-state: pending", dispatch)
        self.assertIn("dispatch-state: accepted", dispatch)
        self.assertIn("dispatch-state: rejected-http-$status", dispatch)
        self.assertIn('rejected_attempts" -ge 2', dispatch)



class TrustedAdmissionProofTests(unittest.TestCase):
    @patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"})
    @patch("autonomy_admission_check._request")
    def test_success_proof_is_created_for_exact_head(self, request):
        request.side_effect = [{"check_runs": []}, {"id": 1}, [], {}]
        sha = "a" * 40
        self.assertTrue(
            admission_check.set_admission_check(17, sha, "success", "verified")
        )
        method, path, payload = request.call_args_list[1].args
        self.assertEqual(method, "POST")
        self.assertEqual(path, "/repos/owner/repo/check-runs")
        self.assertEqual(payload["head_sha"], sha)
        self.assertEqual(payload["name"], "Trusted autonomy admission")
        self.assertEqual(payload["conclusion"], "success")
        status_get_method, status_get_path = request.call_args_list[2].args
        self.assertEqual(status_get_method, "GET")
        self.assertEqual(status_get_path, f"/repos/owner/repo/commits/{sha}/statuses?per_page=100")
        status_method, status_path, status_payload = request.call_args_list[3].args
        self.assertEqual(status_method, "POST")
        self.assertEqual(status_path, f"/repos/owner/repo/statuses/{sha}")
        self.assertEqual(status_payload["context"], "Trusted autonomy admission")
        self.assertEqual(status_payload["state"], "success")

    @patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"})
    @patch("autonomy_admission_check._request")
    def test_uppercase_head_sha_is_normalized_before_publication(self, request):
        request.side_effect = [{"check_runs": []}, {"id": 1}, [], {}]
        sha = "A" * 40
        self.assertTrue(
            admission_check.set_admission_check(20, sha, "success", "verified")
        )
        payload = request.call_args_list[1].args[2]
        self.assertEqual(payload["head_sha"], sha.lower())
        self.assertEqual(
            payload["external_id"],
            f"trusted-autonomy-admission:20:{sha.lower()}",
        )

    @patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"})
    @patch("autonomy_admission_check._request")
    def test_existing_check_is_updated_only_when_owned_by_actions(self, request):
        request.side_effect = [
            {"check_runs": [
                {"id": 11, "app": {"slug": "other-app"}, "started_at": "2026-01-01T00:00:00Z"},
                {"id": 12, "app": {"slug": "github-actions"}, "name": "Trusted autonomy admission", "head_sha": "b" * 40, "external_id": "trusted-autonomy-admission:18:" + "b" * 40, "started_at": "2026-01-02T00:00:00Z"},
            ]},
            {},
            [],
            {},
        ]
        sha = "b" * 40
        self.assertTrue(
            admission_check.set_admission_check(18, sha, "failure", "withheld")
        )
        method, path, payload = request.call_args_list[1].args
        self.assertEqual(method, "PATCH")
        self.assertEqual(path, "/repos/owner/repo/check-runs/12")
        self.assertEqual(payload["head_sha"], sha)
        self.assertEqual(payload["conclusion"], "failure")
        status_get_method, status_get_path = request.call_args_list[2].args
        self.assertEqual(status_get_method, "GET")
        self.assertEqual(status_get_path, f"/repos/owner/repo/commits/{sha}/statuses?per_page=100")
        status_method, status_path, status_payload = request.call_args_list[3].args
        self.assertEqual(status_method, "POST")
        self.assertEqual(status_path, f"/repos/owner/repo/statuses/{sha}")
        self.assertEqual(status_payload["context"], "Trusted autonomy admission")
        self.assertEqual(status_payload["state"], "failure")

    @patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"})
    @patch("autonomy_admission_check._request")
    def test_same_exact_pr_status_is_not_republished(self, request):
        request.side_effect = [
            {"check_runs": []},
            {"id": 1},
            [{
                "context": "Trusted autonomy admission",
                "target_url": "https://github.com/owner/repo/pull/17",
                "state": "success",
                "created_at": "2026-10-25T21:00:00Z",
                "creator": {"login": "github-actions[bot]"},
            }],
        ]
        self.assertTrue(admission_check.set_admission_check(17, "a" * 40, "success", "verified"))
        self.assertEqual(request.call_count, 3)

    @patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"})
    @patch("autonomy_admission_check._request")
    def test_unverified_pr_does_not_create_a_failure_check_unless_label_was_forged(self, request):
        request.return_value = {"check_runs": []}
        self.assertFalse(
            admission_check.set_admission_check(
                19, "c" * 40, "failure", "not eligible", create_if_missing=False
            )
        )
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.args[0], "GET")


class AdmissionLifecycleProofTests(unittest.TestCase):
    def test_label_alone_is_withdrawn_when_trusted_validation_did_not_admit(self):
        number = 201
        sha = "d" * 40
        pr = {"number": number, "head": {"sha": sha, "repo": {"full_name": "owner/repo"}}, "base": {"ref": "main"}, "labels": [{"name": "autonomy:admitted"}]}
        with (
            patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"}),
            patch.object(automation, "REPO", "owner/repo"),
            patch.object(automation, "_reconcile_pr_candidate"),
            patch.object(automation, "set_admission_check") as set_check,
            patch.object(automation, "remove_label") as remove_label,
        ):
            automation.reconcile_pr(pr)
        self.assertEqual(set_check.call_count, 2)
        self.assertEqual(set_check.call_args_list[0].args[:3], (number, sha, "failure"))
        args, kwargs = set_check.call_args
        self.assertEqual(args[:3], (number, sha, "failure"))
        self.assertTrue(kwargs["create_if_missing"])
        remove_label.assert_called_once_with(number, "autonomy:admitted")

    def test_only_successful_trusted_validation_keeps_admission(self):
        number = 202
        sha = "e" * 40
        pr = {"number": number, "head": {"sha": sha, "repo": {"full_name": "owner/repo"}}, "base": {"ref": "main"}, "labels": [{"name": "autonomy:admitted"}]}
        def verified(candidate):
            automation.VERIFIED_ADMISSION_HEADS.add((number, sha))
            automation.set_admission_check(number, sha, "success", "current trusted evidence passed")
        with (
            patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"}),
            patch.object(automation, "REPO", "owner/repo"),
            patch.object(automation, "_reconcile_pr_candidate", side_effect=verified),
            patch.object(automation, "set_admission_check") as set_check,
            patch.object(automation, "remove_label") as remove_label,
        ):
            automation.reconcile_pr(pr)
        self.assertEqual(set_check.call_count, 2)
        self.assertEqual(set_check.call_args_list[0].args[:3], (number, sha, "failure"))
        self.assertEqual(set_check.call_args_list[1].args[:3], (number, sha, "success"))
        remove_label.assert_not_called()


class OwnerCodexAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.sha = "f" * 40
        self.pr = {
            "number": 301,
            "state": "open",
            "draft": False,
            "user": {"login": "owner"},
            "head": {
                "ref": "codex/fix-low-risk",
                "sha": self.sha,
                "repo": {"full_name": "owner/repo"},
            },
            "base": {"ref": "main"},
            "labels": [],
            "body": "Verified routine task",
        }
        self.enterContext(patch.object(automation, "REPO", "owner/repo"))
        self.enterContext(patch.object(automation, "DEFAULT_BRANCH", "main"))
        self.enterContext(patch.object(automation, "REPAIR_APP_LOGIN", "repair[bot]"))

    def test_owner_authored_same_repo_codex_branch_is_recognized(self):
        self.assertTrue(automation.is_owner_codex_pr(self.pr))
        self.assertEqual(automation.automation_kind(self.pr), "codex")

    def test_fork_author_draft_and_non_codex_branches_are_not_eligible(self):
        for change in (
            {"head": {"ref": "codex/fix-low-risk", "sha": self.sha, "repo": {"full_name": "fork/repo"}}},
            {"user": {"login": "someone-else"}},
            {"head": {"ref": "feature/fix-low-risk", "sha": self.sha, "repo": {"full_name": "owner/repo"}}},
            {"draft": True},
        ):
            candidate = copy.deepcopy(self.pr)
            candidate.update(change)
            self.assertFalse(automation.is_owner_codex_pr(candidate))

    def test_owner_exact_head_risk_approval(self):
        owner_review = {
            "state": "APPROVED",
            "commit_id": self.sha,
            "submitted_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
            "user": {"login": "owner"},
        }
        with patch.object(
            automation,
            "get",
            side_effect=lambda endpoint: [owner_review] if "/reviews?" in endpoint else [],
        ):
            self.assertTrue(automation.has_operator_risk_approval(int(self.pr['number']), self.sha))
            self.assertFalse(automation.has_operator_risk_approval(int(self.pr["number"]), "b" * 40))

        rejected_review = dict(owner_review, state="CHANGES_REQUESTED")
        owner_comment = {
            "body": f"/risk-approve {self.sha}",
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=4)).isoformat(),
            "user": {"login": "owner"},
        }
        with patch.object(
            automation,
            "get",
            side_effect=lambda endpoint: (
                [rejected_review] if "/reviews?" in endpoint
                else [owner_comment] if "/comments?" in endpoint
                else []
            ),
        ):
            self.assertTrue(automation.has_operator_risk_approval(int(self.pr['number']), self.sha))

    def test_sensitive_owner_codex_changes_require_operator_risk_approval(self):
        with (
            patch.dict(os.environ, {"ADMISSION_TOKEN": "unit-test", "REPO": "owner/repo"}),
            patch.object(automation, "pr_files", return_value=[".github/workflows/ci.yml"]),
            patch.object(automation, "has_operator_risk_approval", return_value=False),
            patch.object(automation, "add_labels") as add_risk_label,
            patch.object(automation, "comment") as risk_comment,
            patch.object(automation, "admit_to_github_native_auto_merge") as admit,
            patch.object(automation, "set_admission_check"),
            patch.object(automation, "remove_label"),
        ):
            automation.reconcile_pr(self.pr)
        add_risk_label.assert_called_once_with(
            int(self.pr["number"]), [automation.RISK_APPROVAL_LABEL]
        )
        risk_comment.assert_called_once()
        admit.assert_not_called()




class AdmissionRetryDelayTests(unittest.TestCase):
    @patch("autonomy_admission_check.time.time", return_value=30)
    def test_retry_after_http_date_is_parsed(self, _now):
        self.assertEqual(
            admission_check._retry_delay(
                "Thu, 01 Jan 1970 00:00:45 GMT", None, None, 0
            ),
            15.0,
        )

    def test_delta_seconds_and_invalid_headers(self):
        self.assertEqual(admission_check._retry_delay("5", None, None, 0), 5.0)
        self.assertEqual(admission_check._retry_delay("invalid", None, None, 2), 4.0)

    @patch("autonomy_admission_check.time.time", return_value=30)
    def test_rate_limit_reset_is_bounded(self, _now):
        self.assertEqual(admission_check._retry_delay(None, "100", "0", 1), 30.0)



class NativeAutoMergeCurrentLabelTests(unittest.TestCase):
    def test_unstable_status_defers_then_retries_without_bypassing_admission(self):
        summary = {"number": 7, "labels": [{"name": "autonomy:admitted"}], "node_id": "PR_node_7"}
        detail = {"state": "open", "draft": False, "base": {"ref": "main"},
                  "head": {"sha": "a" * 40}, "mergeable": True,
                  "labels": [{"name": "autonomy:admitted"}]}
        with (patch.object(native_auto_merge, "DEFAULT_BRANCH", "main"),
              patch.object(native_auto_merge, "merge_request", return_value=None),
              patch.object(native_auto_merge, "request", return_value=detail),
              patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
              patch.object(native_auto_merge, "enable", side_effect=[
                  RuntimeError("UNPROCESSABLE: Pull request is in unstable status"), None,
              ]) as enable):
            native_auto_merge.reconcile(summary)
            native_auto_merge.reconcile(summary)
        self.assertEqual(enable.call_count, 2)

    def test_unrelated_auto_merge_error_still_fails(self):
        summary = {"number": 7, "labels": [{"name": "autonomy:admitted"}], "node_id": "PR_node_7"}
        detail = {"state": "open", "draft": False, "base": {"ref": "main"},
                  "head": {"sha": "a" * 40}, "mergeable": True,
                  "labels": [{"name": "autonomy:admitted"}]}
        with (patch.object(native_auto_merge, "DEFAULT_BRANCH", "main"),
              patch.object(native_auto_merge, "merge_request", return_value=None),
              patch.object(native_auto_merge, "request", return_value=detail),
              patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
              patch.object(native_auto_merge, "enable", side_effect=RuntimeError("permission denied"))):
            with self.assertRaisesRegex(RuntimeError, "permission denied"):
                native_auto_merge.reconcile(summary)

    def test_fresh_hold_label_blocks_auto_merge_enable(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": True,
            "labels": [
                {"name": "autonomy:admitted"},
                {"name": "autonomy:human-hold"},
            ],
        }
        with (
            patch.object(native_auto_merge, "merge_request", return_value=None),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
            patch.object(native_auto_merge, "enable") as enable,
        ):
            native_auto_merge.reconcile(summary)
        enable.assert_not_called()

    def test_removed_admission_label_preserves_user_auto_merge_request(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": True,
            "labels": [],
        }
        active = {"enabledAt": "2026-01-01T00:00:00Z", "mergeMethod": "SQUASH"}
        with (
            patch.object(native_auto_merge, "merge_request", return_value=active),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(False, True)),
            patch.object(native_auto_merge, "disable") as disable,
        ):
            native_auto_merge.reconcile(summary)
        disable.assert_not_called()

    def test_uncomputed_mergeability_preserves_existing_auto_merge(self):
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "mergeable": None,
            "labels": [{"name": "autonomy:admitted"}],
        }
        active = {"enabledAt": "2026-01-01T00:00:00Z", "mergeMethod": "SQUASH"}
        with (
            patch.object(native_auto_merge, "merge_request", return_value=active),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
            patch.object(native_auto_merge, "enable") as enable,
            patch.object(native_auto_merge, "disable") as disable,
        ):
            native_auto_merge.reconcile(summary)
        enable.assert_not_called()
        disable.assert_not_called()

    def test_admission_evidence_from_another_pr_does_not_count(self):
        sha = "a" * 40
        statuses = [{
            "context": native_auto_merge.ADMISSION_CHECK,
            "target_url": "https://github.com/owner/repo/pull/99",
            "state": "success",
            "created_at": "2026-10-25T21:00:00Z",
            "creator": {"login": "github-actions[bot]"},
        }]
        with (
            patch.object(native_auto_merge, "REPO", "owner/repo"),
            patch.object(native_auto_merge, "request", return_value=statuses),
        ):
            self.assertEqual(native_auto_merge.admission_check(7, sha), (False, False))

    def test_exact_pr_successful_status_counts_for_admission(self):
        sha = "a" * 40
        statuses = [{
            "context": native_auto_merge.ADMISSION_CHECK,
            "target_url": "https://github.com/owner/repo/pull/7",
            "state": "success",
            "created_at": "2026-10-25T21:00:00Z",
            "creator": {"login": "github-actions[bot]"},
        }]
        with (
            patch.object(native_auto_merge, "REPO", "owner/repo"),
            patch.object(native_auto_merge, "request", return_value=statuses),
        ):
            self.assertEqual(native_auto_merge.admission_check(7, sha), (True, True))

    def test_open_pr_listing_fails_closed_at_safety_limit(self):
        page = [{"number": number} for number in range(100)]
        with patch.object(native_auto_merge, "request", side_effect=[page] * 10) as request:
            with self.assertRaisesRegex(RuntimeError, "1,000-item safety limit"):
                native_auto_merge.pages("/repos/owner/repo/pulls?state=open")
        self.assertEqual(request.call_count, 10)


    def test_native_merge_method_uses_a_strategy_enabled_by_repo(self):
        with patch.object(
            native_auto_merge,
            "request",
            return_value={"allow_squash_merge": False, "allow_merge_commit": True, "allow_rebase_merge": True},
        ):
            self.assertEqual(native_auto_merge.merge_method(), "MERGE")


class RiskPolicyRegressionTests(unittest.TestCase):
    def test_repository_security_deployment_and_dependency_paths_are_high_risk(self):
        cases = {
            "AIMS": (
                "services/shared/middleware/suiteAuth.js",
                "services/comms-hub/domain/rbac.js",
                "services/comms-hub/domain/promptSecurity.js",
                "scripts/deployCommsHubDataPlaneWorker.js",
                "config/deployment-check.js",
            ),
            "AIMS-UI": ("workers/gateway/index.js", "workers/gateway/security.ts", "scripts/deploy-production.mjs"),
            "HIVE": ("requirements.in", "requirements-dev.txt", "backend/app/core/security.py"),
            "HIVE-UI": ("workers/gateway/security.ts", "src/lib/session.ts", "src/context/AuthContext.tsx"),
            "MAST": ("src/security.js",),
        }
        for repo, paths in cases.items():
            with self.subTest(repo=repo), patch.object(automation, "REPO", f"Jonathan-Harris1975/{repo}"):
                for path in paths:
                    with self.subTest(path=path):
                        self.assertTrue(automation.sensitive_file(path), path)

    def test_exact_sensitive_paths_are_normalized_before_matching(self):
        with patch.object(automation, "REPO", "Jonathan-Harris1975/AIMS"):
            self.assertTrue(automation.sensitive_file(r".github\scripts\trusted_automation.py"))

    def test_renames_classify_both_old_and_new_paths(self):
        with patch.object(
            automation,
            "get",
            return_value=[{"filename": "docs/new-name.md", "previous_filename": ".github/workflows/ci.yml"}],
        ):
            self.assertEqual(
                automation.pr_files(12),
                ["docs/new-name.md", ".github/workflows/ci.yml"],
            )

    def test_stale_risk_hold_is_removed_after_risky_path_leaves_current_diff(self):
        pr = {"number": 12, "labels": [{"name": automation.RISK_APPROVAL_LABEL}]}
        with (
            patch.object(automation, "REPO", "Jonathan-Harris1975/HIVE-UI"),
            patch.object(automation, "remove_label") as remove_label,
            patch.object(automation, "log"),
        ):
            self.assertFalse(automation.require_operator_risk_approval(pr, ["src/components/example.ts"], "codex"))
        remove_label.assert_called_once_with(12, automation.RISK_APPROVAL_LABEL)

    def test_owner_exact_head_comment_can_approve_owner_authored_codex_pr(self):
        sha = "a" * 40
        owner_comment = {
            "body": f"/risk-approve {sha}",
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
            "user": {"login": "Jonathan-Harris1975"},
        }
        with (
            patch.object(automation, "REPO", "Jonathan-Harris1975/HIVE-UI"),
            patch.object(automation, "get", side_effect=lambda endpoint: [owner_comment] if "/comments?" in endpoint else []),
        ):
            self.assertTrue(automation.has_operator_risk_approval(12, sha))
            self.assertFalse(automation.has_operator_risk_approval(12, "b" * 40))

    def test_exact_head_comment_must_follow_the_latest_owner_review(self):
        sha = "c" * 40
        review = {
            "state": "CHANGES_REQUESTED",
            "commit_id": sha,
            "submitted_at": (datetime.now(timezone.utc) - timedelta(minutes=4)).isoformat(),
            "user": {"login": "Jonathan-Harris1975"},
        }
        earlier_comment = {
            "body": f"/risk-approve {sha}",
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
            "user": {"login": "Jonathan-Harris1975"},
        }
        with (
            patch.object(automation, "REPO", "Jonathan-Harris1975/HIVE-UI"),
            patch.object(automation, "get", side_effect=lambda endpoint: [review] if "/reviews?" in endpoint else [earlier_comment]),
        ):
            self.assertFalse(automation.has_operator_risk_approval(12, sha))




class RiskApprovalExpiryTests(unittest.TestCase):
    def setUp(self):
        self.sha = "a" * 40

    def test_approval_ttl_is_explicitly_bounded(self):
        self.assertEqual(automation.RISK_APPROVAL_TTL.days, 7)

    def test_recent_exact_head_owner_review_is_accepted(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with patch.object(automation, "REPO", "owner/repo"), patch.object(
            automation, "get",
            side_effect=[
                [{"user": {"login": "owner"}, "state": "APPROVED", "commit_id": self.sha, "submitted_at": now}],
                [],
            ],
        ):
            self.assertTrue(automation.has_operator_risk_approval(42, self.sha))

    def test_expired_or_wrong_head_review_is_rejected(self):
        from datetime import datetime, timedelta, timezone
        old = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
        cases = [
            (self.sha, old),
            ("b" * 40, datetime.now(timezone.utc).isoformat()),
        ]
        for commit_id, submitted_at in cases:
            with self.subTest(commit_id=commit_id, submitted_at=submitted_at), patch.object(
                automation, "REPO", "owner/repo"
            ), patch.object(
                automation, "get",
                side_effect=[
                    [{"user": {"login": "owner"}, "state": "APPROVED", "commit_id": commit_id, "submitted_at": submitted_at}],
                    [],
                ],
            ):
                self.assertFalse(automation.has_operator_risk_approval(42, self.sha))

    def test_exact_head_approval_comment_is_accepted_only_while_fresh(self):
        from datetime import datetime, timedelta, timezone
        fresh = datetime.now(timezone.utc).isoformat()
        stale = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
        for timestamp, expected in ((fresh, True), (stale, False)):
            with self.subTest(timestamp=timestamp), patch.object(
                automation, "REPO", "owner/repo"
            ), patch.object(
                automation, "get",
                side_effect=[
                    [],
                    [{"user": {"login": "owner"}, "body": f"/risk-approve {self.sha}", "created_at": timestamp}],
                ],
            ):
                self.assertEqual(
                    automation.has_operator_risk_approval(42, self.sha), expected
                )



if __name__ == "__main__":
    unittest.main()


class KiloControlPlaneProtectionTests(unittest.TestCase):
    def test_kilo_cannot_change_project_overrides_or_its_repair_contract(self):
        root = Path(__file__).resolve().parents[2]
        policy = json.loads((root / "kilo.jsonc").read_text(encoding="utf-8"))
        protected = (
            ".kilo/**",
            ".kilocode/**",
            ".github/kilo-machine-repair-contract.md",
        )
        for tool in ("edit", "write", "apply_patch"):
            rules = policy["permission"][tool]
            for pattern in protected:
                self.assertEqual(rules[pattern], "deny")
                self.assertLess(list(rules).index("*"), list(rules).index(pattern))
