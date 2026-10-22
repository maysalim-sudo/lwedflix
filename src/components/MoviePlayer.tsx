'use client';

import React, { useCallback, useState } from 'react';
import VideoPlayer from './VideoPlayer';
import { getMovieResume, setMovieProgress } from '@/lib/movieProgress';

type MoviePlayerProps = Omit<React.ComponentProps<typeof VideoPlayer>, 'type' | 'resumeAt' | 'onProgress'>;

/** The movie page's player: remembers where you stopped and picks up there. */
const MoviePlayer = (props: MoviePlayerProps) => {
  // Read once per mount; localStorage isn't there during the server render,
  // and the value isn't rendered, so there's nothing to mismatch.
  const [resumeAt] = useState(() => (typeof window === 'undefined' ? undefined : getMovieResume(props.id)));

  const onProgress = useCallback(
    ({ watched, duration }: { watched: number; duration: number }) => setMovieProgress(props.id, watched, duration),
    [props.id]
  );

  return <VideoPlayer {...props} type="movie" resumeAt={resumeAt} onProgress={onProgress} />;
};

export default MoviePlayer;
