import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from backend.utils.error_handler_with_diagnosis import (
    with_auto_diagnosis,
    diagnose_and_handle,
    SelfDiagnosingErrorHandler,
)
from backend.utils.result_types import Result


# Mock Diagnosis Object
class MockDiagnosis:
    def __init__(
        self,
        category="unknown",
        root_cause="unknown",
        confidence=0.8,
        auto_fixable=False,
        severity="low",
    ):
        self.category = MagicMock()
        self.category.value = category
        self.root_cause = root_cause
        self.confidence = confidence
        self.auto_fixable = auto_fixable
        self.suggestions = ["try this"]
        self.severity = MagicMock()
        self.severity.value = severity

    def to_dict(self):
        return {"root_cause": self.root_cause}


@pytest.fixture
def mock_diagnosis_service():
    with patch("backend.utils.error_handler_with_diagnosis.AutoDiagnosisService") as mock_cls:
        mock_instance = mock_cls.return_value

        # Setup default async methods
        mock_instance.diagnose_error = AsyncMock(return_value=MockDiagnosis())
        mock_instance.auto_fix_error = AsyncMock(return_value=Result.success(True))

        # Patch the global getter to return our mock
        with patch(
            "backend.utils.error_handler_with_diagnosis.get_auto_diagnosis",
            return_value=mock_instance,
        ):
            yield mock_instance


@pytest.mark.asyncio
async def test_with_auto_diagnosis_async_success(mock_diagnosis_service):
    @with_auto_diagnosis()
    async def success_func():
        return "success"

    result = await success_func()
    assert result == "success"


@pytest.mark.asyncio
async def test_with_auto_diagnosis_async_error(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(root_cause="test error")

    @with_auto_diagnosis(raise_on_critical=False)
    async def fail_func():
        raise ValueError("failed")

    result = await fail_func()
    assert result.is_error
    assert result._error_message == "test error"


@pytest.mark.asyncio
async def test_with_auto_diagnosis_async_critical(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(severity="critical")

    @with_auto_diagnosis(raise_on_critical=True)
    async def fail_func():
        raise ValueError("critical fail")

    with pytest.raises(ValueError):
        await fail_func()


@pytest.mark.asyncio
async def test_with_auto_diagnosis_async_autofix_success(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(auto_fixable=True)
    mock_diagnosis_service.auto_fix_error.return_value = Result.success(True)

    # We need to simulate failure then success on retry
    # Since the decorator calls the function again, we can use side_effect
    call_count = 0

    async def fail_then_succeed():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise ValueError("fail first")
        return "recovered"

    decorated = with_auto_diagnosis(auto_fix=True)(fail_then_succeed)
    result = await decorated()

    assert result == "recovered"
    assert call_count == 2


@pytest.mark.asyncio
async def test_with_auto_diagnosis_async_autofix_fail(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(auto_fixable=True)
    mock_diagnosis_service.auto_fix_error.return_value = Result.error(
        Exception("fix failed"), "fix failed"
    )

    @with_auto_diagnosis(auto_fix=True, raise_on_critical=False)
    async def fail_func():
        raise ValueError("fail")

    result = await fail_func()
    assert result.is_error


# Sync tests
def test_with_auto_diagnosis_sync_success(mock_diagnosis_service):
    @with_auto_diagnosis()
    def success_func():
        return "success"

    result = success_func()
    assert result == "success"


def test_with_auto_diagnosis_sync_error(mock_diagnosis_service):
    # Mock the diagnose_error to return an awaitable since it's called via loop.run_until_complete
    async def async_diagnose(*args):
        return MockDiagnosis(root_cause="sync error")

    mock_diagnosis_service.diagnose_error = MagicMock(side_effect=async_diagnose)

    @with_auto_diagnosis(raise_on_critical=False)
    def fail_func():
        raise ValueError("sync fail")

    result = fail_func()
    assert result.is_error
    assert result._error_message == "sync error"


@pytest.mark.asyncio
async def test_diagnose_and_handle(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(root_cause="handled")

    result = await diagnose_and_handle(ValueError("test"))

    assert result.is_error
    assert result._error_message == "handled"


@pytest.mark.asyncio
async def test_diagnose_and_handle_autofix(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(auto_fixable=True)
    mock_diagnosis_service.auto_fix_error.return_value = Result.success("fixed")

    result = await diagnose_and_handle(ValueError("test"), auto_fix=True)

    assert result.is_success
    assert result.unwrap() == "fixed"


@pytest.mark.asyncio
async def test_self_diagnosing_error_handler_context(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(root_cause="ctx error")

    handler = SelfDiagnosingErrorHandler()
    with pytest.raises(ValueError):
        async with handler:
            raise ValueError("ctx fail")

    assert len(handler.errors) == 1
    assert handler.errors[0]["diagnosis"]["root_cause"] == "ctx error"


@pytest.mark.asyncio
async def test_self_diagnosing_error_handler_context_autofix(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(auto_fixable=True)
    mock_diagnosis_service.auto_fix_error.return_value = Result.success(True)

    handler = SelfDiagnosingErrorHandler(auto_fix=True)
    async with handler:
        raise ValueError("ctx fail")

    # Should suppress exception
    assert len(handler.errors) == 1


@pytest.mark.asyncio
async def test_self_diagnosing_error_handler_execute(mock_diagnosis_service):
    handler = SelfDiagnosingErrorHandler()

    async def success_coro():
        return "success"

    result = await handler.execute(success_coro())
    assert result.is_success
    assert result.unwrap() == "success"


@pytest.mark.asyncio
async def test_self_diagnosing_error_handler_execute_fail(mock_diagnosis_service):
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(root_cause="exec fail")
    SelfDiagnosingErrorHandler()

    async def fail_coro():
        raise ValueError("fail")

    # We need to recreate coro since it's awaited once inside execute and fails
    # But wait, if we pass a coroutine object that raises exception immediately when awaited,
    # we can't retry it easily unless it's a factory.
    # The current implementation of `execute` takes `coro`.
    # Let's see the implementation of `execute` in `error_handler_with_diagnosis.py`:
    # result = await coro
    # ... if auto_fix ... result = await coro

    # WAIT! You cannot await the SAME coroutine object twice!
    # If `await coro` raises an exception, the coroutine is done/exhausted.
    # You cannot await it again in the retry block: `result = await coro`.
    # This is the same bug I found in `async_utils.py`.

    # I should verify this bug exists with a test case.

    pass


@pytest.mark.asyncio
async def test_self_diagnosing_error_handler_execute_retry_coro_fail(mock_diagnosis_service):
    """Test that retrying a coroutine object fails gracefully"""
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(
        auto_fixable=True, root_cause="fail"
    )
    mock_diagnosis_service.auto_fix_error.return_value = Result.success(True)

    handler = SelfDiagnosingErrorHandler(auto_fix=True)

    async def fail_once():
        raise ValueError("fail")

    # Pass coroutine object
    result = await handler.execute(fail_once())

    # Should return error because we can't retry a coroutine object
    assert result.is_error
    assert result._error_message == "fail"


@pytest.mark.asyncio
async def test_self_diagnosing_error_handler_execute_retry_factory_success(mock_diagnosis_service):
    """Test that retrying a factory function succeeds"""
    mock_diagnosis_service.diagnose_error.return_value = MockDiagnosis(auto_fixable=True)
    mock_diagnosis_service.auto_fix_error.return_value = Result.success(True)

    handler = SelfDiagnosingErrorHandler(auto_fix=True)

    call_count = 0

    async def fail_then_succeed():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise ValueError("fail first")
        return "recovered"

    # Pass factory function
    result = await handler.execute(fail_then_succeed)

    assert result.is_success
    assert result.unwrap() == "recovered"
    assert call_count == 2
