// Admin Translation Requests: the queue (deadline / overdue), and one
// request — mark handled, reject, answer (audio saved first, then the
// answer, then the email), and the optional copy into shared content.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockList = jest.fn();
const mockGet = jest.fn();
const mockMarkInProgress = jest.fn();
const mockReject = jest.fn();
const mockSetAudio = jest.fn();
const mockSetExplanation = jest.fn();
const mockAnswer = jest.fn();
const mockShare = jest.fn();
const mockListUnits = jest.fn();
const mockListLessons = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = { requestId: 'req-1' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(cb, []);
  },
}));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'admin-1' } } }) }));
jest.mock('@/data/admin/translationRequests', () => ({
  listOpenTranslationRequests: (...a: unknown[]) => mockList(...a),
  getTranslationRequestAdmin: (...a: unknown[]) => mockGet(...a),
  markTranslationRequestInProgress: (...a: unknown[]) => mockMarkInProgress(...a),
  rejectTranslationRequest: (...a: unknown[]) => mockReject(...a),
  setTranslationAnswerAudio: (...a: unknown[]) => mockSetAudio(...a),
  setTranslationExplanationAudio: (...a: unknown[]) => mockSetExplanation(...a),
  answerTranslationRequest: (...a: unknown[]) => mockAnswer(...a),
  shareTranslationToAppContent: (...a: unknown[]) => mockShare(...a),
}));
jest.mock('@/data/admin/content', () => ({
  listUnitsAdmin: (...a: unknown[]) => mockListUnits(...a),
  listLessonsForUnit: (...a: unknown[]) => mockListLessons(...a),
}));
// The recorder/uploader is tested on its own; this stub exposes the props
// this screen hands it and lets a test "save" a recording.
jest.mock('@/components/admin/AudioRecorderField', () => ({
  AudioRecorderField: ({
    wordGroupId,
    variantId,
    audioBucket,
    currentAudioPath,
    onUploaded,
  }: {
    wordGroupId: string;
    variantId: string;
    audioBucket?: string;
    currentAudioPath: string | null;
    onUploaded: (path: string) => Promise<string | null>;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Recorder ${variantId} folder=${wordGroupId} bucket=${audioBucket} current=${currentAudioPath}`}</Text>
        <Pressable onPress={() => onUploaded(`${wordGroupId}/${variantId}-9.m4a`).catch(() => {})}>
          <Text>{`Fake save ${variantId}`}</Text>
        </Pressable>
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Queue = require('../../../app/admin/translation-requests').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Detail = require('../../../app/admin/translation-requests/[requestId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const request = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1',
  englishText: 'Where is the market?',
  status: 'submitted',
  submittedAt: '2026-10-26T09:00:00Z',
  dueAt: '2026-10-29T23:00:00Z',
  answerArabic: null,
  answerTransliteration: null,
  answerEnglish: null,
  answerAudioPath: null,
  answerExplanationAudioPath: null,
  answeredAt: null,
  sharedWordGroupId: null,
  emailStatus: null,
  ...overrides,
});

const NOW = Date.parse('2026-10-29T20:00:00Z'); // 3h before req-1 is due
let dateNowSpy: jest.SpyInstance;

beforeEach(() => {
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockParams = { requestId: 'req-1' };
  mockList.mockReset().mockResolvedValue([]);
  mockGet.mockReset().mockResolvedValue(request());
  mockMarkInProgress.mockReset().mockResolvedValue(undefined);
  mockReject.mockReset().mockResolvedValue(undefined);
  mockSetAudio.mockReset().mockImplementation(async (_id: string, path: string) => path);
  mockSetExplanation.mockReset().mockImplementation(async (_id: string, path: string | null) => path);
  mockAnswer.mockReset().mockResolvedValue({ email: 'sent' });
  mockShare.mockReset().mockResolvedValue({ wordGroupId: 'tr_x' });
  mockListUnits.mockReset().mockResolvedValue([{ id: 'unit-1', name: 'Shopping' }]);
  mockListLessons.mockReset().mockResolvedValue([{ id: 'l-1', unitId: 'unit-1', lessonNumber: 2, title: 'At the market' }]);
  mockPush.mockReset();
});
afterEach(() => dateNowSpy.mockRestore());

const wrap = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

describe('queue', () => {
  it('lists pending requests with when they were sent and the time left or overdue', async () => {
    mockList.mockResolvedValue([
      request({ id: 'late', englishText: 'Good morning', dueAt: '2026-10-29T17:00:00Z', status: 'in_progress' }),
      request(),
    ]);
    await wrap(<Queue />);

    expect(await screen.findByText('Where is the market?')).toBeOnTheScreen();
    expect(screen.getByText('3h left')).toBeOnTheScreen();
    expect(screen.getByText('Overdue by 3h')).toBeOnTheScreen();
    expect(screen.getAllByText(/Sent Mon, Oct 26/).length).toBe(2);
    expect(screen.getByText('Being handled')).toBeOnTheScreen();
    expect(screen.getByText(/1 overdue/)).toBeOnTheScreen();
  });

  it('opens a request', async () => {
    mockList.mockResolvedValue([request()]);
    await wrap(<Queue />);

    await fireEvent.press(await screen.findByText('Where is the market?'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/translation-requests/[requestId]', params: { requestId: 'req-1' } });
  });

  it('empty and error states', async () => {
    await wrap(<Queue />);
    expect(await screen.findByText(/No pending requests/)).toBeOnTheScreen();
  });

  it('a failed load explains and offers Retry', async () => {
    mockList.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValue([request()]);
    await wrap(<Queue />);

    expect(await screen.findByText(/Couldn.t load requests.*permission denied/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Where is the market?')).toBeOnTheScreen();
  });
});

describe('one request', () => {
  it('shows the request and its deadline, and records answer audio in the request’s private folder', async () => {
    await wrap(<Detail />);

    expect(await screen.findByText('Where is the market?')).toBeOnTheScreen();
    expect(screen.getByText(/3h left/)).toBeOnTheScreen();
    expect(screen.getByText('Recorder answer folder=req-1 bucket=translation-audio current=null')).toBeOnTheScreen();
  });

  it('can be marked as being handled', async () => {
    await wrap(<Detail />);

    await fireEvent.press(await screen.findByText('Mark as being handled'));

    expect(mockMarkInProgress).toHaveBeenCalledWith('req-1');
    expect(await screen.findByText('Being handled')).toBeOnTheScreen();
  });

  it('reject asks first, then hides it from the learner', async () => {
    await wrap(<Detail />);

    await fireEvent.press(await screen.findByText('Reject'));
    expect(mockReject).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Yes, reject it'));

    expect(mockReject).toHaveBeenCalledWith('req-1');
    expect(await screen.findByText(/Rejected — the learner no longer sees this request/)).toBeOnTheScreen();
    expect(screen.queryByText('Send answer')).toBeNull();
  });

  it('a failed reject shows the error and leaves it open', async () => {
    mockReject.mockRejectedValue(new Error('This request is no longer open.'));
    await wrap(<Detail />);

    await fireEvent.press(await screen.findByText('Reject'));
    await fireEvent.press(screen.getByText('Yes, reject it'));

    expect(await screen.findByText(/no longer open/)).toBeOnTheScreen();
    expect(screen.queryByText(/Rejected — /)).toBeNull();
  });

  it('shows the learner’s question apart from the Meaning field, which starts empty (never a copy of the question)', async () => {
    await wrap(<Detail />);

    expect(await screen.findByText(/Learner’s question \(private/)).toBeOnTheScreen();
    expect(screen.getByText('Where is the market?')).toBeOnTheScreen();
    const meaning = screen.getByPlaceholderText(/natural English/);
    expect(meaning.props.value).toBe('');
    expect(screen.queryByDisplayValue('Where is the market?')).toBeNull();
  });

  it('a meaning saved on an earlier visit is loaded back into the field', async () => {
    mockGet.mockResolvedValue(request({ status: 'in_progress', answerEnglish: 'Where’s the souk?' }));
    await wrap(<Detail />);
    expect(await screen.findByDisplayValue('Where’s the souk?')).toBeOnTheScreen();
  });

  it('sending without a Meaning says it is needed and saves nothing', async () => {
    mockGet.mockResolvedValue(request({ answerAudioPath: 'req-1/answer-1.m4a' }));
    await wrap(<Detail />);
    await fireEvent.changeText(await screen.findByPlaceholderText('Tunisian Arabic'), 'وين السوق؟');
    await fireEvent.changeText(screen.getByPlaceholderText('Transliteration'), 'win es-souk?');

    await fireEvent.press(screen.getByText('Send answer'));

    expect(await screen.findByText(/Add the Meaning/)).toBeOnTheScreen();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it('the answered view labels the question and the meaning separately', async () => {
    mockGet.mockResolvedValue(
      request({
        status: 'answered',
        answerArabic: 'وين السوق؟',
        answerTransliteration: 'win es-souk?',
        answerEnglish: 'Where’s the market?',
        answerAudioPath: 'req-1/answer-1.m4a',
        answeredAt: '2026-10-27T10:00:00Z',
      })
    );
    await wrap(<Detail />);

    expect(await screen.findByText(/Learner’s question \(private/)).toBeOnTheScreen();
    expect(screen.getByText('Where is the market?')).toBeOnTheScreen();
    expect(screen.getByText(/Meaning: Where’s the market\?/)).toBeOnTheScreen();
    // What sharing would publish — the curated answer only.
    expect(screen.getByText(/learner’s question is never shared/)).toBeOnTheScreen();
  });

  async function fillAnswer() {
    await fireEvent.changeText(await screen.findByPlaceholderText('Tunisian Arabic'), 'وين السوق؟');
    await fireEvent.changeText(screen.getByPlaceholderText('Transliteration'), 'win es-souk?');
    await fireEvent.changeText(screen.getByPlaceholderText(/natural English/), 'Where’s the market?');
  }

  it('Send answer waits for the native recording to be saved', async () => {
    await wrap(<Detail />);
    await fillAnswer();

    await fireEvent.press(screen.getByText('Send answer'));
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(screen.getByText(/Save the native recording first/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Fake save answer'));
    expect(mockSetAudio).toHaveBeenCalledWith('req-1', 'req-1/answer-9.m4a');
    await fireEvent.press(screen.getByText('Send answer'));

    expect(mockAnswer).toHaveBeenCalledWith('req-1', {
      arabic: 'وين السوق؟',
      transliteration: 'win es-souk?',
      english: 'Where’s the market?',
    });
    expect(await screen.findByText(/Answer sent/)).toBeOnTheScreen();
    expect(screen.getByText(/learner was emailed/)).toBeOnTheScreen();
  });

  it('a request whose audio was already saved (earlier visit) can be answered straight away', async () => {
    mockGet.mockResolvedValue(request({ status: 'in_progress', answerAudioPath: 'req-1/answer-1.m4a' }));
    await wrap(<Detail />);
    await fillAnswer();

    await fireEvent.press(screen.getByText('Send answer'));
    expect(mockAnswer).toHaveBeenCalled();
  });

  it('if saving the answer fails: error, no "sent", and the typed answer is kept to retry', async () => {
    mockGet.mockResolvedValue(request({ answerAudioPath: 'req-1/answer-1.m4a' }));
    mockAnswer.mockRejectedValueOnce(new Error('Couldn’t save the answer (Failed to fetch).')).mockResolvedValueOnce({ email: 'sent' });
    await wrap(<Detail />);
    await fillAnswer();

    await fireEvent.press(screen.getByText('Send answer'));
    expect(await screen.findByText(/Failed to fetch/)).toBeOnTheScreen();
    expect(screen.queryByText(/Answer sent/)).toBeNull();
    expect(screen.getByDisplayValue('وين السوق؟')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Send answer'));
    expect(await screen.findByText(/Answer sent/)).toBeOnTheScreen();
  });

  it.each([
    [{ email: 'not_configured' }, /Email isn.t set up on the server yet/],
    [{ email: 'failed', message: 'provider down' }, /Couldn.t send the email \(provider down\)/],
  ])('email outcome %o is reported honestly (the answer itself is saved)', async (outcome, message) => {
    mockGet.mockResolvedValue(request({ answerAudioPath: 'req-1/answer-1.m4a' }));
    mockAnswer.mockResolvedValue(outcome);
    await wrap(<Detail />);
    await fillAnswer();

    await fireEvent.press(screen.getByText('Send answer'));

    expect(await screen.findByText(/Answer sent/)).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.queryByText(/learner was emailed/)).toBeNull();
  });

  describe('after answering: add to shared content?', () => {
    async function answerIt() {
      mockGet.mockResolvedValue(request({ answerAudioPath: 'req-1/answer-1.m4a' }));
      await wrap(<Detail />);
      await fillAnswer();
      await fireEvent.press(screen.getByText('Send answer'));
      await screen.findByText(/Answer sent/);
    }

    it('is only asked once the answer is saved', async () => {
      await wrap(<Detail />);
      await screen.findByText('Where is the market?');
      expect(screen.queryByText(/Add this translation to the app/)).toBeNull();
    });

    it('keeping it private does nothing else', async () => {
      await answerIt();

      expect(screen.getByText(/Add this translation to the app/)).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Keep it private'));

      expect(mockShare).not.toHaveBeenCalled();
      expect(await screen.findByText(/Kept private to the learner/)).toBeOnTheScreen();
    });

    it('adding it: choose where, then it goes to the Approval Queue (not live)', async () => {
      await answerIt();

      await fireEvent.press(screen.getByText('Add to app content'));
      await fireEvent.press(await screen.findByText('Shopping'));
      await fireEvent.press(await screen.findByText(/Lesson 2/));
      await fireEvent.press(screen.getByText('Add for review'));

      expect(mockShare).toHaveBeenCalledWith({
        request: expect.objectContaining({
          id: 'req-1',
          answerArabic: 'وين السوق؟',
          answerTransliteration: 'win es-souk?',
          answerEnglish: 'Where’s the market?',
          answerAudioPath: 'req-1/answer-1.m4a',
        }),
        unitId: 'unit-1',
        lessonNumber: 2,
        actorAccountId: 'admin-1',
        includePronunciation: true,
        includeExplanation: false, // this answer has no explanation recording
      });
      expect(await screen.findByText(/Added to the Approval Queue/)).toBeOnTheScreen();
    });

    it('a unit with a single lesson selects it for you, so Add for review works straight away', async () => {
      await answerIt();

      await fireEvent.press(screen.getByText('Add to app content'));
      await fireEvent.press(await screen.findByText('Shopping'));
      await screen.findByText(/Lesson 2/);
      await fireEvent.press(screen.getByText('Add for review'));

      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'unit-1', lessonNumber: 2 }));
      expect(await screen.findByText(/Added to the Approval Queue/)).toBeOnTheScreen();
    });

    it('pressing Add for review before choosing says what is missing (never a silent no-op)', async () => {
      mockListLessons.mockResolvedValue([
        { id: 'l-1', unitId: 'unit-1', lessonNumber: 1, title: 'Basics' },
        { id: 'l-2', unitId: 'unit-1', lessonNumber: 2, title: 'At the market' },
      ]);
      await answerIt();

      await fireEvent.press(screen.getByText('Add to app content'));
      await screen.findByText('Shopping');
      await fireEvent.press(screen.getByText('Add for review'));
      expect(await screen.findByText(/Choose a unit first/)).toBeOnTheScreen();

      await fireEvent.press(screen.getByText('Shopping'));
      await screen.findByText(/Lesson 2/);
      await fireEvent.press(screen.getByText('Add for review'));
      expect(await screen.findByText(/Choose a lesson/)).toBeOnTheScreen();
      expect(mockShare).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByText(/Lesson 2/));
      await fireEvent.press(screen.getByText('Add for review'));
      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ lessonNumber: 2 }));
    });

    it('a unit with no lessons says so', async () => {
      mockListLessons.mockResolvedValue([]);
      await answerIt();

      await fireEvent.press(screen.getByText('Add to app content'));
      await fireEvent.press(await screen.findByText('Shopping'));

      expect(await screen.findByText(/This unit has no lessons yet/)).toBeOnTheScreen();
    });

    it('a failed add shows the error and can be retried', async () => {
      mockShare.mockRejectedValueOnce(new Error('duplicate key')).mockResolvedValueOnce({ wordGroupId: 'tr_x' });
      await answerIt();

      await fireEvent.press(screen.getByText('Add to app content'));
      await fireEvent.press(await screen.findByText('Shopping'));
      await fireEvent.press(await screen.findByText(/Lesson 2/));
      await fireEvent.press(screen.getByText('Add for review'));
      expect(await screen.findByText(/duplicate key/)).toBeOnTheScreen();

      await fireEvent.press(screen.getByText('Add for review'));
      expect(await screen.findByText(/Added to the Approval Queue/)).toBeOnTheScreen();
    });
  });

  it('an already-answered request shows the answer, read-only', async () => {
    mockGet.mockResolvedValue(
      request({
        status: 'answered',
        answerArabic: 'وين السوق؟',
        answerTransliteration: 'win es-souk?',
        answerEnglish: 'Where is the market?',
        answerAudioPath: 'req-1/answer-1.m4a',
        answeredAt: '2026-10-27T10:00:00Z',
        sharedWordGroupId: 'tr_x',
      })
    );
    await wrap(<Detail />);

    expect(await screen.findByText('Answered')).toBeOnTheScreen();
    expect(screen.getByText('وين السوق؟')).toBeOnTheScreen();
    expect(screen.queryByText('Send answer')).toBeNull();
    expect(screen.getByText(/Added to app content for review/)).toBeOnTheScreen();
  });

  it('a missing request says so', async () => {
    mockGet.mockResolvedValue(null);
    await wrap(<Detail />);
    expect(await screen.findByText(/Request not found/)).toBeOnTheScreen();
  });
});

describe('explanation recording on a translation answer', () => {
  it('offers a separate, optional explanation recorder in the request’s private folder', async () => {
    await wrap(<Detail />);

    expect(await screen.findByText(/Explanation recording \(optional\)/)).toBeOnTheScreen();
    expect(screen.getByText('Recorder explanation folder=req-1 bucket=translation-audio current=null')).toBeOnTheScreen();
  });

  it('saving an explanation stores it separately from the pronunciation', async () => {
    await wrap(<Detail />);

    await fireEvent.press(await screen.findByText('Fake save explanation'));

    expect(mockSetExplanation).toHaveBeenCalledWith('req-1', 'req-1/explanation-9.m4a');
    expect(mockSetAudio).not.toHaveBeenCalled();
  });

  it('is not required: an answer with just the pronunciation can be sent', async () => {
    mockGet.mockResolvedValue(request({ answerAudioPath: 'req-1/answer-1.m4a' }));
    await wrap(<Detail />);
    await fireEvent.changeText(await screen.findByPlaceholderText('Tunisian Arabic'), 'وين السوق؟');
    await fireEvent.changeText(screen.getByPlaceholderText('Transliteration'), 'win es-souk?');
    await fireEvent.changeText(screen.getByPlaceholderText(/natural English/), 'Where’s the market?');

    await fireEvent.press(screen.getByText('Send answer'));

    expect(mockAnswer).toHaveBeenCalled();
    expect(await screen.findByText(/Answer sent/)).toBeOnTheScreen();
  });

  describe('sharing: choose which recordings go into app content', () => {
    async function answerWith(overrides: Record<string, unknown>) {
      mockGet.mockResolvedValue(request({ answerAudioPath: 'req-1/answer-1.m4a', ...overrides }));
      await wrap(<Detail />);
      await fireEvent.changeText(await screen.findByPlaceholderText('Tunisian Arabic'), 'وين السوق؟');
      await fireEvent.changeText(screen.getByPlaceholderText('Transliteration'), 'win es-souk?');
      await fireEvent.changeText(screen.getByPlaceholderText(/natural English/), 'Where’s the market?');
      await fireEvent.press(screen.getByText('Send answer'));
      await screen.findByText(/Answer sent/);
      await fireEvent.press(screen.getByText('Add to app content'));
      await fireEvent.press(await screen.findByText('Shopping'));
      await screen.findByText(/Lesson 2/);
    }
    const box = (name: RegExp) => screen.getByRole('checkbox', { name });

    it('both recordings are offered and ticked; each can be left out independently', async () => {
      await answerWith({ answerExplanationAudioPath: 'req-1/explanation-1.m4a' });

      expect(box(/Include pronunciation recording/).props.accessibilityState).toMatchObject({ checked: true });
      expect(box(/Include explanation recording/).props.accessibilityState).toMatchObject({ checked: true });
      await fireEvent.press(box(/Include explanation recording/));
      await fireEvent.press(screen.getByText('Add for review'));

      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({ includePronunciation: true, includeExplanation: false })
      );
    });

    it('pronunciation can be left out while keeping the explanation', async () => {
      await answerWith({ answerExplanationAudioPath: 'req-1/explanation-1.m4a' });

      await fireEvent.press(box(/Include pronunciation recording/));
      await fireEvent.press(screen.getByText('Add for review'));

      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ includePronunciation: false, includeExplanation: true }));
    });

    it('no explanation on the answer: only the pronunciation choice is shown', async () => {
      await answerWith({});

      expect(box(/Include pronunciation recording/)).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: /Include explanation recording/ })).toBeNull();
      await fireEvent.press(screen.getByText('Add for review'));
      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ includePronunciation: true, includeExplanation: false }));
    });
  });
});
