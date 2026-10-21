"""Tests for explicit, authorised @kilocode-bot fix it routing and Kilo trigger selection."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("GITHUB_REPOSITORY", "owner/repository")
os.environ.setdefault("GH_TOKEN", "test-token")
os.environ.setdefault("GITHUB_EVENT_NAME", "issue_comment")
os.environ.setdefault("DEFAULT_BRANCH", "main")
sys.path.insert(0, str(Path(__file__).parent))
import kilo_webhook_url as webhook
import pr_repair_router as router


class ExplicitKiloFixCommandTests(unittest.TestCase):
    def setUp(self):
        self.pr = {
            "number": 7,
            "html_url": "https://github.com/owner/repository/pull/7",
            "state": "open",
            "draft": False,
            "labels": [],
            "user": {"login": "owner"},
            "head": {"sha": "a" * 40, "ref": "feature", "repo": {"full_name": "owner/repository"}},
            "base": {"ref": "main"},
        }

    def event(self, body="@kilocode-bot fix it", association="OWNER", comment_id=912):
        return {
            "issue": {"number": 7, "pull_request": {"url": self.pr["html_url"]}},
            "comment": {
                "id": comment_id,
                "body": body,
                "html_url": f"{self.pr['html_url']}#issuecomment-{comment_id}",
                "user": {"login": "alice"},
                "author_association": association,
            },
        }

    def test_exact_owner_command_routes_current_pr(self):
        with patch.object(router, "EVENT", "issue_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            result = router.extract(self.event())
        self.assertIsNotNone(result)
        pr, kind, findings = result
        self.assertEqual(pr["number"], 7)
        self.assertEqual(kind, "fix-command")
        self.assertIn("explicitly requested", findings[0])
        self.assertIn("#issuecomment-912", findings[0])
        self.assertIn("a" * 40, findings[0])

    def test_repeated_commands_for_same_head_share_dedupe_key(self):
        with patch.object(router, "EVENT", "issue_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            first = router.extract(self.event(comment_id=912))
            second = router.extract(self.event(comment_id=913))
        self.assertEqual(first[1], second[1])
        self.assertEqual(first[1], "fix-command")

    def test_empty_kilo_review_evidence_is_ignored(self):
        event = self.event(body="No findings")
        event["comment"]["user"] = {"login": "kilo-code-bot[bot]"}
        with patch.object(router, "EVENT", "issue_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            result = router.extract(event)
        self.assertIsNone(result)

    def test_non_actionable_kilo_comment_stays_ignored(self):
        event = self.event(body="Reply with @kilocode-bot fix it")
        event["comment"]["user"] = {"login": "kilo-code-bot[bot]"}
        with patch.object(router, "EVENT", "issue_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            result = router.extract(event)
        self.assertIsNone(result)

    def test_exact_command_from_untrusted_actor_is_ignored(self):
        with patch.object(router, "EVENT", "issue_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            result = router.extract(self.event(association="NONE"))
        self.assertIsNone(result)

    def test_command_with_extra_text_is_not_treated_as_authorised_shortcut(self):
        with patch.object(router, "EVENT", "issue_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            result = router.extract(self.event(body="@kilocode-bot fix it and also do something else"))
        self.assertIsNone(result)

    def test_exact_command_also_routes_from_inline_review_reply(self):
        event = {
            "pull_request": {"number": 7},
            "comment": {
                "id": 913,
                "body": "@kilocode-bot fix it",
                "html_url": f"{self.pr['html_url']}#discussion_r913",
                "user": {"login": "alice"},
                "author_association": "COLLABORATOR",
                "path": "src/example.py",
            },
        }
        with patch.object(router, "EVENT", "pull_request_review_comment"), patch.object(
            router, "pr_details", return_value=self.pr
        ):
            result = router.extract(event)
        self.assertIsNotNone(result)
        self.assertEqual(result[1], "fix-command")
        self.assertIn("src/example.py", result[2][0])


class TriggerSecretRoutingTests(unittest.TestCase):
    """Failed checks and branch-state repairs use the Debug trigger; review repairs use the Code trigger."""

    def test_failed_checks_and_branch_state_repairs_use_debug_trigger(self):
        for kind in ("check", "merge-conflict-" + "a" * 40, "branch-behind-" + "b" * 40):
            with self.subTest(kind=kind):
                self.assertEqual(router.trigger_secret_for(kind), "KILO_DEBUG_TRIGGER_URL")

    def test_review_and_explicit_repairs_stay_on_code_trigger(self):
        for kind in ("review", "fix-command", "review-threads-" + "c" * 40):
            with self.subTest(kind=kind):
                self.assertEqual(router.trigger_secret_for(kind), "KILO_REPAIR_TRIGGER_URL")

    def test_every_routed_kind_resolves_to_a_known_trigger_secret(self):
        kinds = (
            "check",
            "review",
            "fix-command",
            "merge-conflict-" + "a" * 40,
            "branch-behind-" + "b" * 40,
            "review-threads-" + "c" * 40,
        )
        for kind in kinds:
            with self.subTest(kind=kind):
                self.assertIn(
                    router.trigger_secret_for(kind),
                    ("KILO_DEBUG_TRIGGER_URL", "KILO_REPAIR_TRIGGER_URL"),
                )

    def test_validator_reads_the_secret_in_use_for_the_trigger_kind(self):
        with patch.dict(os.environ, {
            "KILO_DEBUG_TRIGGER_URL": "https://hooks.kilosessions.ai/debug",
            "KILO_REPAIR_TRIGGER_URL": "https://hooks.kilosessions.ai/repair",
        }, clear=False):
            self.assertEqual(webhook.configured_trigger_url("check"), "https://hooks.kilosessions.ai/debug")
            self.assertEqual(webhook.configured_trigger_url("repair"), "https://hooks.kilosessions.ai/repair")

    def test_missing_trigger_diagnostic_names_the_secret_without_exposing_it(self):
        error = RuntimeError(
            "Configure KILO_DEBUG_TRIGGER_URL with "
            "https://hooks.kilosessions.ai/debug?token=sentinel-secret"
        )
        message = router.safe_route_error(error)
        self.assertIn("KILO_DEBUG_TRIGGER_URL", message)
        self.assertNotIn("sentinel-secret", message)
        self.assertNotIn("hooks.kilosessions.ai", message)

    def test_security_workflow_runs_the_routing_regressions_on_pull_requests(self):
        workflow = (Path(__file__).parents[1] / "workflows/security.yml").read_text()
        self.assertIn("python3 .github/scripts/test_kilo_fix_command.py", workflow)


if __name__ == "__main__":
    unittest.main()
