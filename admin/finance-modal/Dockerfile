# syntax=docker/dockerfile:1

# `gcloud run jobs deploy --source admin/finance-modal` builds this file. Pinned
# on purpose: the Modal client is the whole reason this job exists (its billing
# report is SDK-only), and a silent client bump is the one thing that could
# change what the snapshot says.

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN pip install --no-cache-dir --disable-pip-version-check \
    modal==1.3.3 \
    google-cloud-firestore==2.34.1
COPY main.py ./
# The slim image has no unprivileged user; the job needs none of root.
RUN useradd --system --no-create-home --uid 10001 job
USER job
CMD ["python", "main.py"]
