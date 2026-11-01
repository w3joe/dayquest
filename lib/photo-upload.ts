export type Photo = {
  url?: string;
  preview?: string;
  matching?: string;
  error?: string;
  busy?: boolean;
  manualMatch?: boolean;
  pending?: boolean;
  previous?: Photo;
};

// The URL remains committed until the replacement is safely stored. Previews
// and errors can change without losing the last usable photo or saved draft.
export function startPhotoUpload(photo?: Photo): Photo {
  return {
    ...photo,
    busy: true,
    pending: true,
    error: undefined,
    previous: photo?.pending ? photo.previous : photo,
  };
}

export function discardPhotoUpload(photo?: Photo): Photo {
  return photo?.previous ?? {};
}
